using Geopolitics.Data.Models;
using Geopolitics.Services;

namespace Geopolitics.Services.Tests;

public class TurnManagerTests
{
    private static void GiveAllCountries(GameDoc game, string fromPlayerId, string toPlayerId)
    {
        foreach (var c in game.Countries.Where(c => c.OwnerPlayerId == fromPlayerId))
            c.OwnerPlayerId = toPlayerId;
    }

    [Fact]
    public void Reinforcements_are_two_per_country_from_round_two()
    {
        var game = TestGames.NewGame();
        game.Round = 2;
        TurnManager.BeginTurn(game);
        Assert.Equal(2, game.PendingReinforcements);

        // Give the current player a second country: 2 countries = 4 soldiers.
        var current = TurnManager.CurrentPlayer(game);
        var other = game.Countries.First(c => c.OwnerPlayerId != current.PlayerId);
        other.OwnerPlayerId = current.PlayerId;
        TurnManager.BeginTurn(game);
        Assert.Equal(4, game.PendingReinforcements);
    }

    [Fact]
    public void Advancing_moves_to_the_next_player_in_the_same_round()
    {
        var game = TestGames.NewGame();
        TurnManager.AdvanceToNextTurn(game);
        Assert.Equal(1, game.CurrentPlayerIndex);
        Assert.Equal(1, game.Round);
        Assert.Equal(0, game.PendingReinforcements);
    }

    [Fact]
    public void Wrapping_around_starts_the_next_round_with_reinforcements()
    {
        var game = TestGames.NewGame();
        game.CurrentPlayerIndex = 9;
        TurnManager.AdvanceToNextTurn(game);
        Assert.Equal(0, game.CurrentPlayerIndex);
        Assert.Equal(2, game.Round);
        Assert.Equal(2, game.PendingReinforcements);
    }

    [Fact]
    public void Eliminated_players_are_skipped()
    {
        var game = TestGames.NewGame();

        // Find a non-human player directly after the current one and eliminate them.
        int idx = Enumerable.Range(0, 8).First(i => !game.Players[i + 1].IsHuman);
        var victim = game.Players[idx + 1];
        GiveAllCountries(game, victim.PlayerId, game.Players[idx].PlayerId);
        TurnManager.UpdateStatus(game);

        Assert.True(victim.IsEliminated);
        Assert.Equal(GameStatus.InProgress, game.Status);

        game.CurrentPlayerIndex = idx;
        TurnManager.AdvanceToNextTurn(game);
        Assert.Equal(idx + 2, game.CurrentPlayerIndex);
    }

    [Fact]
    public void Advancing_clears_an_active_attack()
    {
        var game = TestGames.NewGame();
        game.Phase = TurnPhase.Attacking;
        game.ActiveAttack = new ActiveAttack { AttackerCode = "c0", DefenderCode = "c1", DefenderSoldiersAtStart = 3 };
        TurnManager.AdvanceToNextTurn(game);
        Assert.Null(game.ActiveAttack);
        Assert.Equal(TurnPhase.Action, game.Phase);
    }

    [Fact]
    public void Human_losing_every_country_means_the_game_is_lost()
    {
        var game = TestGames.NewGame();
        var human = game.Players.First(p => p.IsHuman);
        var npc = game.Players.First(p => !p.IsHuman);
        GiveAllCountries(game, human.PlayerId, npc.PlayerId);
        TurnManager.UpdateStatus(game);
        Assert.Equal(GameStatus.Lost, game.Status);
    }

    [Fact]
    public void Owning_every_country_wins_the_game()
    {
        var game = TestGames.NewGame();
        var human = game.Players.First(p => p.IsHuman);
        foreach (var c in game.Countries) c.OwnerPlayerId = human.PlayerId;
        TurnManager.UpdateStatus(game);
        Assert.Equal(GameStatus.Won, game.Status);
    }

    [Fact]
    public void Finished_games_do_not_advance()
    {
        var game = TestGames.NewGame();
        game.Status = GameStatus.Won;
        int before = game.CurrentPlayerIndex;
        TurnManager.AdvanceToNextTurn(game);
        Assert.Equal(before, game.CurrentPlayerIndex);
    }
}
