using Geopolitics.Data.Models;
using Geopolitics.Engine;
using EngineCountry = Geopolitics.Engine.Country;

namespace Geopolitics.Services;

// Every move a player (human or NPC) can make. Each method checks the rules,
// changes the GameDoc only if the move is legal, and returns the events that
// describe it. No database access here, so it is easy to test.
public static class GameActions
{
    // ---------- helpers ----------

    private static CountryState? Find(GameDoc g, string code) =>
        g.Countries.FirstOrDefault(c => c.Code == code);

    private static string Name(GameDoc g, string playerId) =>
        g.Players.First(p => p.PlayerId == playerId).DisplayName;

    private static EngineCountry ToEngine(CountryState c) =>
        new(c.Code, c.Name, c.Population, c.OwnerPlayerId, c.Soldiers);

    private static GameEvent Ev(GameDoc g, GameEventType type, string playerId, string message,
        string? attackerCode = null, string? defenderCode = null) =>
        new()
        {
            GameId = g.Id ?? "",
            Round = g.Round,
            Type = type,
            PlayerId = playerId,
            Message = message,
            AttackerCode = attackerCode,
            DefenderCode = defenderCode
        };

    private static GameActionResult? CheckTurn(GameDoc g, string playerId)
    {
        if (g.Status != GameStatus.InProgress)
            return GameActionResult.Fail("The game is over.");
        if (TurnManager.CurrentPlayer(g).PlayerId != playerId)
            return GameActionResult.Fail("It is not your turn.");
        return null;
    }

    private static void EndAttack(GameDoc g)
    {
        g.Phase = TurnPhase.Action;
        g.ActiveAttack = null;
    }

    // ---------- moves ----------

    public static GameActionResult Reinforce(GameDoc g, string playerId, string countryCode, int count)
    {
        var err = CheckTurn(g, playerId);
        if (err != null) return err;
        if (g.Phase != TurnPhase.Action)
            return GameActionResult.Fail("Finish the attack first.");
        if (count < 1 || count > g.PendingReinforcements)
            return GameActionResult.Fail($"You have {g.PendingReinforcements} soldier(s) left to place.");

        var country = Find(g, countryCode);
        if (country == null || country.OwnerPlayerId != playerId)
            return GameActionResult.Fail("You can only reinforce your own countries.");

        country.Soldiers += count;
        g.PendingReinforcements -= count;

        return GameActionResult.Success(new[]
        {
            Ev(g, GameEventType.Reinforce, playerId,
               $"{Name(g, playerId)} placed {count} soldier(s) in {country.Name}.")
        });
    }

    public static GameActionResult Transfer(GameDoc g, string playerId, string fromCode, string toCode, int count)
    {
        var err = CheckTurn(g, playerId);
        if (err != null) return err;
        if (g.Phase == TurnPhase.Attacking)
            return GameActionResult.Fail("You cannot transfer soldiers while an attack is in progress.");
        if (g.PendingReinforcements > 0)
            return GameActionResult.Fail("Place your reinforcements first.");

        var from = Find(g, fromCode);
        var to = Find(g, toCode);
        if (from == null || to == null || from == to)
            return GameActionResult.Fail("Choose two different countries.");
        if (from.OwnerPlayerId != playerId || to.OwnerPlayerId != playerId)
            return GameActionResult.Fail("You can only transfer between countries you control.");

        // The engine enforces "a country keeps at least 1 soldier".
        var a = ToEngine(from);
        var b = ToEngine(to);
        try
        {
            EngineCountry.Transfer(a, b, count);
        }
        catch (InvalidOperationException ex)
        {
            return GameActionResult.Fail(ex.Message);
        }

        from.Soldiers = a.Soldiers;
        to.Soldiers = b.Soldiers;

        return GameActionResult.Success(new[]
        {
            Ev(g, GameEventType.Transfer, playerId,
               $"{Name(g, playerId)} moved {count} soldier(s) from {from.Name} to {to.Name}.")
        });
    }

    public static GameActionResult StartAttack(GameDoc g, string playerId, string attackerCode, string defenderCode)
    {
        var err = CheckTurn(g, playerId);
        if (err != null) return err;
        if (g.Phase == TurnPhase.Attacking)
            return GameActionResult.Fail("An attack is already in progress.");
        if (g.HasAttackedThisTurn)
            return GameActionResult.Fail("You can only attack once per turn.");
        if (g.PendingReinforcements > 0)
            return GameActionResult.Fail("Place your reinforcements first.");

        var attacker = Find(g, attackerCode);
        var defender = Find(g, defenderCode);
        if (attacker == null || defender == null)
            return GameActionResult.Fail("Unknown country.");
        if (attacker.OwnerPlayerId != playerId)
            return GameActionResult.Fail("You can only attack from a country you control.");
        if (defender.OwnerPlayerId == playerId)
            return GameActionResult.Fail("You cannot attack your own country.");
        if (!BattleEngine.CanAttack(new EngineCountry(attacker.Code, attacker.Name, attacker.Population, attacker.OwnerPlayerId, attacker.Soldiers)))
            return GameActionResult.Fail("You need at least 2 soldiers in the attacking country.");

        g.Phase = TurnPhase.Attacking;
        g.HasAttackedThisTurn = true;
        g.ActiveAttack = new ActiveAttack
        {
            AttackerCode = attacker.Code,
            DefenderCode = defender.Code,
            DefenderSoldiersAtStart = defender.Soldiers
        };

        return GameActionResult.Success(new[]
        {
            Ev(g, GameEventType.AttackStarted, playerId,
               $"{Name(g, playerId)} attacks {defender.Name} from {attacker.Name}.",
               attacker.Code, defender.Code)
        });
    }

    public static GameActionResult Roll(GameDoc g, string playerId, IDice dice)
    {
        var err = CheckTurn(g, playerId);
        if (err != null) return err;
        if (g.Phase != TurnPhase.Attacking || g.ActiveAttack == null)
            return GameActionResult.Fail("There is no attack in progress.");

        var attack = g.ActiveAttack;
        var attacker = Find(g, attack.AttackerCode)!;
        var defender = Find(g, attack.DefenderCode)!;

        var engineAttacker = ToEngine(attacker);
        var engineDefender = ToEngine(defender);
        var round = BattleEngine.ResolveRound(engineAttacker, engineDefender, dice);
        attacker.Soldiers = engineAttacker.Soldiers;
        defender.Soldiers = engineDefender.Soldiers;

        var name = Name(g, playerId);
        var rolled = Ev(g, GameEventType.DiceRolled, playerId,
            $"{attacker.Name} rolled [{string.Join(", ", round.AttackerRolls)}] against " +
            $"{defender.Name} [{string.Join(", ", round.DefenderRolls)}]. " +
            $"Attacker loses {round.AttackerLosses}, defender loses {round.DefenderLosses}.",
            attacker.Code, defender.Code);
        rolled.AttackerRolls = round.AttackerRolls.ToList();
        rolled.DefenderRolls = round.DefenderRolls.ToList();
        rolled.AttackerLosses = round.AttackerLosses;
        rolled.DefenderLosses = round.DefenderLosses;

        var events = new List<GameEvent> { rolled };

        switch (round.Outcome)
        {
            case BattleOutcome.Conquered:
            {
                // Reward is based on the defender's soldiers before the attack began.
                int reward = BattleEngine.ConquestReward(attack.DefenderSoldiersAtStart);
                defender.OwnerPlayerId = playerId;
                defender.Soldiers = reward;
                events.Add(Ev(g, GameEventType.CountryConquered, playerId,
                    $"{name} conquered {defender.Name} and gains {reward} soldier(s) there.",
                    attacker.Code, defender.Code));
                EndAttack(g);

                var alreadyOut = g.Players.Where(p => p.IsEliminated).Select(p => p.PlayerId).ToHashSet();
                TurnManager.UpdateStatus(g);
                foreach (var p in g.Players.Where(p => p.IsEliminated && !alreadyOut.Contains(p.PlayerId)))
                    events.Add(Ev(g, GameEventType.PlayerEliminated, p.PlayerId,
                        $"{p.DisplayName} has been eliminated."));

                if (g.Status == GameStatus.Won)
                    events.Add(Ev(g, GameEventType.GameWon, playerId, $"{name} has conquered the world!"));
                else if (g.Status == GameStatus.Lost)
                    events.Add(Ev(g, GameEventType.GameLost, playerId, "You have been eliminated. The game is lost."));
                break;
            }
            case BattleOutcome.AttackerExhausted:
                events.Add(Ev(g, GameEventType.AttackEnded, playerId,
                    $"{name} is down to 1 soldier in {attacker.Name}. The attack on {defender.Name} fails.",
                    attacker.Code, defender.Code));
                EndAttack(g);
                break;
        }

        return GameActionResult.Success(events);
    }

    // Stopping an attack ends the player's turn.
    public static GameActionResult StopAttack(GameDoc g, string playerId)
    {
        var err = CheckTurn(g, playerId);
        if (err != null) return err;
        if (g.Phase != TurnPhase.Attacking)
            return GameActionResult.Fail("There is no attack in progress.");

        var events = new List<GameEvent>
        {
            Ev(g, GameEventType.AttackEnded, playerId,
               $"{Name(g, playerId)} stopped the attack and ended their turn.")
        };
        TurnManager.AdvanceToNextTurn(g);
        return GameActionResult.Success(events);
    }

    // Skipping (ending) the turn hands over to the next player.
    public static GameActionResult EndTurn(GameDoc g, string playerId)
    {
        var err = CheckTurn(g, playerId);
        if (err != null) return err;
        if (g.Phase == TurnPhase.Attacking)
            return GameActionResult.Fail("Stop the attack first.");
        if (g.PendingReinforcements > 0)
            return GameActionResult.Fail("Place your reinforcements first.");

        var events = new List<GameEvent>
        {
            Ev(g, GameEventType.TurnSkipped, playerId, $"{Name(g, playerId)} ended their turn.")
        };
        TurnManager.AdvanceToNextTurn(g);
        return GameActionResult.Success(events);
    }
}
