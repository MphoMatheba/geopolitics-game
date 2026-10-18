using Geopolitics.Data.Models;

namespace Geopolitics.Services;

public record AttackPlan(string AttackerCode, string DefenderCode, double WinChance, string Justification);
public record ReinforcePlan(string CountryCode, string Justification);
public record TransferPlan(string FromCode, string ToCode, int Count, string Justification);

// How NPCs decide. Every NPC uses the same strategy (the brief allows this).
// Decisions are based on the exact odds from Odds, and each plan carries a
// short justification built from the same numbers that drove the decision.
public static class NpcStrategy
{
    // Only attack when the chance of conquering is at least this high.
    public const double AttackThreshold = 0.55;

    // Keep rolling mid-attack while the chance stays at least this high.
    public const double ContinueThreshold = 0.40;

    private record Candidate(CountryState Attacker, CountryState Defender, int Force, double WinChance, double Score);

    public static string Pct(double probability) => $"{Math.Round(probability * 100)}%";

    private static string OwnerName(GameDoc g, string playerId) =>
        g.Players.First(p => p.PlayerId == playerId).DisplayName;

    // Best attack for this player. `soldiersOf` lets the caller ask "what if this
    // country had more soldiers?", and `only` limits the attacking country.
    private static Candidate? BestCandidate(
        GameDoc g, string playerId, Func<CountryState, int> soldiersOf, CountryState? only = null)
    {
        Candidate? best = null;

        var attackers = g.Countries
            .Where(c => c.OwnerPlayerId == playerId && soldiersOf(c) >= 2 && (only == null || c == only))
            .ToList();
        var targets = g.Countries.Where(c => c.OwnerPlayerId != playerId).ToList();

        foreach (var attacker in attackers)
        {
            foreach (var target in targets)
            {
                int force = soldiersOf(attacker);
                double chance = Odds.ConquestChance(force, target.Soldiers);
                if (chance < AttackThreshold) continue;

                // What winning is worth: the soldiers gained, plus 2 more
                // reinforcements every turn, plus a bonus for knocking out a rival.
                double value = Math.Max(2, target.Soldiers / 2) + 2;
                if (TurnManager.CountriesOwned(g, target.OwnerPlayerId) == 1) value += 3;

                // What losing could cost: about half the attacking force.
                double cost = 0.5 * (force - 1);

                double score = chance * value - (1 - chance) * cost;
                if (best == null || score > best.Score)
                    best = new Candidate(attacker, target, force, chance, score);
            }
        }

        return best;
    }

    public static AttackPlan? ChooseAttack(GameDoc g, string playerId)
    {
        var c = BestCandidate(g, playerId, x => x.Soldiers);
        if (c == null) return null;

        bool eliminates = TurnManager.CountriesOwned(g, c.Defender.OwnerPlayerId) == 1;
        string gain = $"Taking it adds {Math.Max(2, c.Defender.Soldiers / 2)} soldiers and 2 more reinforcements every turn"
                      + (eliminates ? $", and knocks {OwnerName(g, c.Defender.OwnerPlayerId)} out of the game." : ".");

        string why = $"Attacking {c.Defender.Name} from {c.Attacker.Name}: {c.Attacker.Soldiers} vs " +
                     $"{c.Defender.Soldiers} soldiers gives about {Pct(c.WinChance)} to conquer. {gain}";

        return new AttackPlan(c.Attacker.Code, c.Defender.Code, c.WinChance, why);
    }

    // All pending reinforcements go to one country. Try each of my countries as
    // the launch point and pick the one that sets up the best attack.
    public static ReinforcePlan ChooseReinforcement(GameDoc g, string playerId)
    {
        int pending = g.PendingReinforcements;
        var mine = g.Countries.Where(c => c.OwnerPlayerId == playerId).ToList();

        Candidate? bestPlan = null;
        CountryState? bestStack = null;

        foreach (var stack in mine)
        {
            var plan = BestCandidate(g, playerId, x => x.Soldiers + (x == stack ? pending : 0), only: stack);
            if (plan != null && (bestPlan == null || plan.Score > bestPlan.Score))
            {
                bestPlan = plan;
                bestStack = stack;
            }
        }

        if (bestPlan != null && bestStack != null)
        {
            return new ReinforcePlan(bestStack.Code,
                $"Concentrating {pending} reinforcement(s) in {bestStack.Name} " +
                $"({bestStack.Soldiers} to {bestStack.Soldiers + pending}) to attack {bestPlan.Defender.Name} " +
                $"at about {Pct(bestPlan.WinChance)} odds.");
        }

        var weakest = mine.OrderBy(c => c.Soldiers).First();
        return new ReinforcePlan(weakest.Code,
            $"No attack looks good enough yet, so I am shoring up my weakest country, {weakest.Name}, with {pending} soldier(s).");
    }

    // After attacking, move a soldier into any country left with just 1, taking
    // it from a country that can spare one.
    public static TransferPlan? ChooseTransfer(GameDoc g, string playerId)
    {
        var mine = g.Countries.Where(c => c.OwnerPlayerId == playerId).ToList();
        var thin = mine.FirstOrDefault(c => c.Soldiers == 1);
        var donor = mine.OrderByDescending(c => c.Soldiers).First();

        if (thin == null || donor == thin || donor.Soldiers < 4) return null;

        return new TransferPlan(donor.Code, thin.Code, 1,
            $"Moving 1 soldier from {donor.Name} ({donor.Soldiers}) to {thin.Name} (1) so it is not an easy target.");
    }
}
