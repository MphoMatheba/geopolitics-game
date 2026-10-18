using Geopolitics.Data.Models;
using Geopolitics.Engine;

namespace Geopolitics.Services;

// Plays whole NPC turns by calling the same GameActions a human uses, so an
// NPC can never do anything a player could not. The justification for each
// decision is attached to the event that the decision produced.
public static class NpcTurnRunner
{
    private const int MaxRollsPerAttack = 500;

    // Plays NPC turns one after another until it is the human's turn (or the game ends).
    public static List<GameEvent> PlayUntilHumanTurn(GameDoc g, IDice dice)
    {
        var events = new List<GameEvent>();
        int guard = 0;

        while (g.Status == GameStatus.InProgress
               && !TurnManager.CurrentPlayer(g).IsHuman
               && guard++ < 10_000)
        {
            events.AddRange(PlayTurn(g, TurnManager.CurrentPlayer(g).PlayerId, dice));
        }

        return events;
    }

    public static List<GameEvent> PlayTurn(GameDoc g, string playerId, IDice dice)
    {
        var events = new List<GameEvent>();

        void Do(GameActionResult result, string why)
        {
            if (!result.Ok)
                throw new InvalidOperationException($"NPC attempted an illegal move: {result.Error}");
            if (result.Events.Count > 0)
                result.Events[0].Justification = why;
            events.AddRange(result.Events);
        }

        // 1. Place reinforcements.
        if (g.PendingReinforcements > 0)
        {
            var plan = NpcStrategy.ChooseReinforcement(g, playerId);
            Do(GameActions.Reinforce(g, playerId, plan.CountryCode, g.PendingReinforcements), plan.Justification);
        }

        // 2. Attack, if there is a worthwhile target.
        var attack = NpcStrategy.ChooseAttack(g, playerId);
        if (attack != null)
        {
            Do(GameActions.StartAttack(g, playerId, attack.AttackerCode, attack.DefenderCode), attack.Justification);

            string defenderName = g.Countries.First(c => c.Code == attack.DefenderCode).Name;
            string reason = $"Opening the assault on {defenderName}.";
            int rolls = 0;

            while (g.Phase == TurnPhase.Attacking && g.Status == GameStatus.InProgress && rolls++ < MaxRollsPerAttack)
            {
                Do(GameActions.Roll(g, playerId, dice), reason);
                if (g.Phase != TurnPhase.Attacking) break;   // conquered, or attacker ran out

                var a = g.Countries.First(c => c.Code == attack.AttackerCode);
                var d = g.Countries.First(c => c.Code == attack.DefenderCode);
                double chance = Odds.ConquestChance(a.Soldiers, d.Soldiers);

                if (chance >= NpcStrategy.ContinueThreshold)
                {
                    reason = $"Odds are still {NpcStrategy.Pct(chance)} ({a.Soldiers} vs {d.Soldiers}), so I keep pushing.";
                }
                else
                {
                    // Stopping an attack ends the turn.
                    Do(GameActions.StopAttack(g, playerId),
                        $"Odds fell to {NpcStrategy.Pct(chance)} ({a.Soldiers} vs {d.Soldiers}), so I am retreating to save soldiers.");
                    return events;
                }
            }

            if (g.Status != GameStatus.InProgress) return events;

            if (g.Phase == TurnPhase.Attacking)
            {
                Do(GameActions.StopAttack(g, playerId), "This attack has gone on long enough, so I am retreating.");
                return events;
            }
        }

        // 3. Garrison thin countries.
        for (int i = 0; i < 3; i++)
        {
            var transfer = NpcStrategy.ChooseTransfer(g, playerId);
            if (transfer == null) break;
            Do(GameActions.Transfer(g, playerId, transfer.FromCode, transfer.ToCode, transfer.Count), transfer.Justification);
        }

        // 4. End the turn.
        string endReason = attack == null
            ? $"No target offered at least {NpcStrategy.Pct(NpcStrategy.AttackThreshold)} odds, so I am holding position."
            : "Finished my attack for this turn.";
        Do(GameActions.EndTurn(g, playerId), endReason);

        return events;
    }
}
