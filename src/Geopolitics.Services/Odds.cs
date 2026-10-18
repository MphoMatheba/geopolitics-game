namespace Geopolitics.Services;

// The exact chance that an attack succeeds, worked out from the dice rules.
// For every pair of dice, the attacker wins 15/36, the defender wins 15/36
// and a tie happens 6/36. The calculation follows the battle round by round
// (dynamic programming), exactly as BattleEngine plays it.
public static class Odds
{
    // Very large stacks are scaled down (keeping their ratio) so the
    // calculation stays fast. The result only guides NPC decisions.
    private const int Cap = 60;

    private const double PairWin = 15.0 / 36;
    private const double PairTie = 6.0 / 36;

    private static readonly double[] LogFactorial = BuildLogFactorials(Cap + 1);
    private static readonly Dictionary<(int, int), double> Cache = new();
    private static readonly object Gate = new();

    // Chance that an attacker with `attackerSoldiers` conquers a country with
    // `defenderSoldiers`, fighting until the defender is wiped out or the
    // attacker is down to 1 soldier.
    public static double ConquestChance(int attackerSoldiers, int defenderSoldiers)
    {
        if (defenderSoldiers <= 0) return 1.0;
        if (attackerSoldiers < 2) return 0.0;

        int largest = Math.Max(attackerSoldiers, defenderSoldiers);
        if (largest > Cap)
        {
            double scale = (double)Cap / largest;
            attackerSoldiers = Math.Max(2, (int)Math.Round(attackerSoldiers * scale));
            defenderSoldiers = Math.Max(1, (int)Math.Round(defenderSoldiers * scale));
        }

        lock (Gate)
            return Chance(attackerSoldiers, defenderSoldiers);
    }

    private static double Chance(int a, int d)
    {
        if (d <= 0) return 1.0;     // conquered (takes priority over the attacker dropping to 1)
        if (a < 2) return 0.0;      // attacker can no longer fight
        if (Cache.TryGetValue((a, d), out var known)) return known;

        int dice = Math.Min(a - 1, d);
        double total = 0;

        for (int attackerWins = 0; attackerWins <= dice; attackerWins++)
        {
            for (int defenderWins = 0; attackerWins + defenderWins <= dice; defenderWins++)
            {
                // A round where nobody loses a soldier changes nothing; it is
                // handled by dividing by the chance that something does happen.
                if (attackerWins == 0 && defenderWins == 0) continue;

                int ties = dice - attackerWins - defenderWins;
                double probability = Math.Exp(
                    LogFactorial[dice] - LogFactorial[attackerWins] - LogFactorial[defenderWins] - LogFactorial[ties]
                    + (attackerWins + defenderWins) * Math.Log(PairWin)
                    + ties * Math.Log(PairTie));

                // The defender loses one soldier per attacker win, and vice versa.
                total += probability * Chance(a - defenderWins, d - attackerWins);
            }
        }

        double result = total / (1 - Math.Pow(PairTie, dice));
        Cache[(a, d)] = result;
        return result;
    }

    private static double[] BuildLogFactorials(int size)
    {
        var table = new double[size];
        for (int i = 2; i < size; i++)
            table[i] = table[i - 1] + Math.Log(i);
        return table;
    }
}
