using Geopolitics.Data;
using Geopolitics.Data.Models;
using Geopolitics.Services;

namespace Geopolitics.Services.Tests;

public class NpcTurnRunnerTests
{
    [Fact]
    public void An_npc_turn_passes_to_the_next_player_and_every_decision_is_explained()
    {
        var game = TestGames.NewGame();
        game.CurrentPlayerIndex = game.Players.FindIndex(p => !p.IsHuman);
        TurnManager.BeginTurn(game);
        var npc = TurnManager.CurrentPlayer(game).PlayerId;

        var events = NpcTurnRunner.PlayTurn(game, npc, new SeededDice(1));

        Assert.NotEmpty(events);
        if (game.Status == GameStatus.InProgress)
            Assert.NotEqual(npc, TurnManager.CurrentPlayer(game).PlayerId);

        var decisions = new[]
        {
            GameEventType.Reinforce, GameEventType.Transfer, GameEventType.AttackStarted,
            GameEventType.DiceRolled, GameEventType.TurnSkipped
        };
        foreach (var e in events.Where(e => decisions.Contains(e.Type)))
            Assert.False(string.IsNullOrWhiteSpace(e.Justification), $"{e.Type} had no justification");
    }

    [Fact]
    public void Npc_turns_stop_when_it_is_the_humans_turn()
    {
        var game = TestGames.NewGame();
        TurnManager.BeginTurn(game);

        NpcTurnRunner.PlayUntilHumanTurn(game, new SeededDice(5));

        if (game.Status == GameStatus.InProgress)
            Assert.True(TurnManager.CurrentPlayer(game).IsHuman);
    }

    [Fact]
    public void Many_simulated_games_never_produce_an_illegal_move_or_a_broken_board()
    {
        for (int seed = 1; seed <= 40; seed++)
        {
            var game = GameFactory.Create("owner", "Tester", TestGames.Countries(), new Random(seed));
            TurnManager.BeginTurn(game);
            var dice = new SeededDice(seed);
            NpcTurnRunner.PlayUntilHumanTurn(game, dice);

            for (int round = 0; round < 300 && game.Status == GameStatus.InProgress; round++)
            {
                // The human does nothing except place reinforcements and end the turn.
                var human = TurnManager.CurrentPlayer(game).PlayerId;
                if (game.PendingReinforcements > 0)
                {
                    var home = game.Countries.First(c => c.OwnerPlayerId == human);
                    Assert.True(GameActions.Reinforce(game, human, home.Code, game.PendingReinforcements).Ok);
                }
                Assert.True(GameActions.EndTurn(game, human).Ok);

                NpcTurnRunner.PlayUntilHumanTurn(game, dice);
                AssertBoardIsConsistent(game, seed);
            }
        }
    }

    [Fact]
    public void Games_where_every_player_uses_the_strategy_run_to_the_end_cleanly()
    {
        // Evenly matched countries (4 soldiers each), so games last many rounds.
        var evenCountries = Enumerable.Range(0, 10)
            .Select(i => new CountryInfo($"c{i}", $"Country {i}", 30_000_000L))
            .ToList();

        for (int seed = 1; seed <= 40; seed++)
        {
            var game = GameFactory.Create("owner", "Tester", evenCountries, new Random(seed));
            TurnManager.BeginTurn(game);
            var dice = new SeededDice(seed);

            int turns = 0;
            while (game.Status == GameStatus.InProgress && turns++ < 5000)
            {
                NpcTurnRunner.PlayTurn(game, TurnManager.CurrentPlayer(game).PlayerId, dice);
                AssertBoardIsConsistent(game, seed);
            }

            Assert.NotEqual(GameStatus.InProgress, game.Status);   // every game finishes
        }
    }

    private static void AssertBoardIsConsistent(GameDoc game, int seed)
    {
        Assert.Equal(10, game.Countries.Count);
        foreach (var country in game.Countries)
            Assert.True(country.Soldiers >= 1, $"seed {seed}: {country.Name} has {country.Soldiers} soldiers");

        foreach (var player in game.Players)
        {
            int owned = TurnManager.CountriesOwned(game, player.PlayerId);
            if (player.IsEliminated)
                Assert.Equal(0, owned);
            else
                Assert.True(owned >= 1, $"seed {seed}: {player.DisplayName} owns nothing but is not eliminated");
        }
    }
}
