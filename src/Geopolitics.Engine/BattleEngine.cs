namespace Geopolitics.Engine;

public enum BattleOutcome { Continue, Conquered, AttackerExhausted }

public record BattleRound(
    IReadOnlyList<int> AttackerRolls,
    IReadOnlyList<int> DefenderRolls,
    int AttackerLosses,
    int DefenderLosses,
    BattleOutcome Outcome);

public static class BattleEngine
{
    public static bool CanAttack(Country attacker) => attacker.Soldiers >= 2;

    public static BattleRound ResolveRound(Country attacker, Country defender, IDice dice)
    {
        if (attacker.OwnerId == defender.OwnerId)
            throw new InvalidOperationException("Cannot attack your own country.");
        if (!CanAttack(attacker))
            throw new InvalidOperationException("Attacker needs at least 2 soldiers.");

        int diceCount = Math.Min(attacker.Soldiers - 1, defender.Soldiers);
        var attackerRolls = Enumerable.Range(0, diceCount).Select(_ => dice.Roll()).ToList();
        var defenderRolls = Enumerable.Range(0, diceCount).Select(_ => dice.Roll()).ToList();

        int attackerLosses = 0, defenderLosses = 0;
        for (int i = 0; i < diceCount; i++)
        {
            if (attackerRolls[i] > defenderRolls[i]) defenderLosses++;
            else if (attackerRolls[i] < defenderRolls[i]) attackerLosses++;
        }

        attacker.RemoveSoldiers(attackerLosses);
        defender.RemoveSoldiers(defenderLosses);

        var outcome = defender.Soldiers == 0 ? BattleOutcome.Conquered
                    : attacker.Soldiers < 2 ? BattleOutcome.AttackerExhausted
                    : BattleOutcome.Continue;

        return new BattleRound(attackerRolls, defenderRolls, attackerLosses, defenderLosses, outcome);
    }

    public static int ConquestReward(int defenderSoldiersBeforeAttack) =>
        Math.Max(2, defenderSoldiersBeforeAttack / 2);

    public static int ReinforcementsFor(int countriesControlled) => 2 * countriesControlled;
}
