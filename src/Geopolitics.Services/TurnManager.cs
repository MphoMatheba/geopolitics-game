using Geopolitics.Data.Models;
using Geopolitics.Engine;

namespace Geopolitics.Services;

// Rules for whose turn it is, reinforcements, elimination and win/loss.
// Operates on the stored GameDoc and holds no state of its own.
public static class TurnManager
{
    public static PlayerState CurrentPlayer(GameDoc game) =>
        game.Players[game.CurrentPlayerIndex];

    public static int CountriesOwned(GameDoc game, string playerId) =>
        game.Countries.Count(c => c.OwnerPlayerId == playerId);

    // A player who controls no countries is eliminated.
    public static void RefreshElimination(GameDoc game)
    {
        foreach (var player in game.Players)
        {
            if (!player.IsEliminated && CountriesOwned(game, player.PlayerId) == 0)
                player.IsEliminated = true;
        }
    }

    // Eliminations first, then: human eliminated = Lost, human is the only
    // survivor (conquered all ten countries) = Won.
    public static void UpdateStatus(GameDoc game)
    {
        RefreshElimination(game);

        var human = game.Players.First(p => p.IsHuman);
        if (human.IsEliminated)
            game.Status = GameStatus.Lost;
        else if (game.Players.Count(p => !p.IsEliminated) == 1)
            game.Status = GameStatus.Won;
    }

    // Round 1 has no reinforcements. From round 2, 2 soldiers per country owned.
    public static void BeginTurn(GameDoc game)
    {
        game.PendingReinforcements = game.Round >= 2
            ? BattleEngine.ReinforcementsFor(CountriesOwned(game, CurrentPlayer(game).PlayerId))
            : 0;
    }

    // Moves to the next player who is still in the game. When the order wraps
    // back to the first player, a new round starts.
    public static void AdvanceToNextTurn(GameDoc game)
    {
        if (game.Status != GameStatus.InProgress) return;

        game.ActiveAttack = null;
        game.Phase = TurnPhase.Action;

        do
        {
            game.CurrentPlayerIndex++;
            if (game.CurrentPlayerIndex >= game.Players.Count)
            {
                game.CurrentPlayerIndex = 0;
                game.Round++;
            }
        }
        while (CurrentPlayer(game).IsEliminated);

        BeginTurn(game);
    }
}
