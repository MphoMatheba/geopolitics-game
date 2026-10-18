using Geopolitics.Data;
using Geopolitics.Data.Models;
using Geopolitics.Engine;
using Geopolitics.Services;

namespace Geopolitics.Services.Tests;

internal static class TestGames
{
    public static List<CountryInfo> Countries() =>
        Enumerable.Range(0, 10)
            .Select(i => new CountryInfo($"c{i}", $"Country {i}", (i + 1) * 12_000_000L))
            .ToList();

    public static GameDoc NewGame(int seed = 42) =>
        GameFactory.Create("owner1", "Tester", Countries(), new Random(seed));
}

public class GameFactoryTests
{
    [Fact]
    public void Creates_ten_players_and_ten_countries()
    {
        var game = TestGames.NewGame();
        Assert.Equal(10, game.Players.Count);
        Assert.Equal(10, game.Countries.Count);
        Assert.Equal(GameStatus.InProgress, game.Status);
    }

    [Fact]
    public void Each_player_starts_with_exactly_one_country()
    {
        var game = TestGames.NewGame();
        foreach (var player in game.Players)
            Assert.Equal(1, TurnManager.CountriesOwned(game, player.PlayerId));
    }

    [Fact]
    public void Human_owns_the_home_country_with_population_based_soldiers()
    {
        var game = TestGames.NewGame();
        var human = game.Players.Single(p => p.IsHuman);
        var home = game.Countries.Single(c => c.OwnerPlayerId == human.PlayerId);
        Assert.Equal("c0", home.Code);
        Assert.Equal(SoldierTable.ForPopulation(12_000_000), home.Soldiers);
    }

    [Fact]
    public void Turn_order_is_a_permutation_of_zero_to_nine()
    {
        var game = TestGames.NewGame();
        for (int i = 0; i < game.Players.Count; i++)
            Assert.Equal(i, game.Players[i].TurnOrder);
    }

    [Fact]
    public void Same_seed_gives_the_same_turn_order()
    {
        var a = TestGames.NewGame(7).Players.Select(p => p.PlayerId);
        var b = TestGames.NewGame(7).Players.Select(p => p.PlayerId);
        Assert.Equal(a, b);
    }

    [Fact]
    public void Round_one_has_no_reinforcements()
    {
        var game = TestGames.NewGame();
        TurnManager.BeginTurn(game);
        Assert.Equal(0, game.PendingReinforcements);
    }

    [Fact]
    public void Wrong_country_count_is_rejected()
    {
        var few = TestGames.Countries().Take(9).ToList();
        Assert.Throws<ArgumentException>(() =>
            GameFactory.Create("owner1", "Tester", few, new Random(1)));
    }
}
