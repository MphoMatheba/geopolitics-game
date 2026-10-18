using Geopolitics.Data;
using Geopolitics.Data.Models;
using Geopolitics.Data.Repositories;
using Geopolitics.Engine;

namespace Geopolitics.Services;

public class GameService(
    IGameRepository games,
    IEventRepository events,
    CountryCatalog catalog,
    IDice dice)
{
    public async Task<GameDoc> CreateGameAsync(string ownerUserId, string humanName, string homeCountryCode)
    {
        var countries = catalog.PickGameCountries(
            homeCountryCode, GameFactory.CountriesPerGame - 1, Random.Shared);

        var game = GameFactory.Create(ownerUserId, humanName, countries, Random.Shared);
        TurnManager.BeginTurn(game);
        game.LastEventSequence = 1;

        await games.CreateAsync(game);   // the driver fills in game.Id

        var order = string.Join(", ", game.Players.Select(p => p.DisplayName));
        await events.AppendAsync(new[]
        {
            new GameEvent
            {
                GameId = game.Id!,
                Sequence = 1,
                Round = 1,
                Type = GameEventType.GameStarted,
                PlayerId = TurnManager.CurrentPlayer(game).PlayerId,
                Message = $"Game started. Turn order: {order}."
            }
        });

        return game;
    }

    // ---------- player actions ----------

    public Task<GameActionResult> ReinforceAsync(string gameId, string userId, string countryCode, int count) =>
        ApplyAsync(gameId, userId, (g, me) => GameActions.Reinforce(g, me, countryCode, count));

    public Task<GameActionResult> TransferAsync(string gameId, string userId, string fromCode, string toCode, int count) =>
        ApplyAsync(gameId, userId, (g, me) => GameActions.Transfer(g, me, fromCode, toCode, count));

    public Task<GameActionResult> StartAttackAsync(string gameId, string userId, string attackerCode, string defenderCode) =>
        ApplyAsync(gameId, userId, (g, me) => GameActions.StartAttack(g, me, attackerCode, defenderCode));

    public Task<GameActionResult> RollAsync(string gameId, string userId) =>
        ApplyAsync(gameId, userId, (g, me) => GameActions.Roll(g, me, dice));

    public Task<GameActionResult> StopAttackAsync(string gameId, string userId) =>
        ApplyAsync(gameId, userId, (g, me) => GameActions.StopAttack(g, me));

    public Task<GameActionResult> EndTurnAsync(string gameId, string userId) =>
        ApplyAsync(gameId, userId, (g, me) => GameActions.EndTurn(g, me));

    // Loads the game, checks the caller owns it, applies the move to the human
    // player, then saves the game and its events. The version check on save
    // rejects the move if the game changed in the meantime.
    private async Task<GameActionResult> ApplyAsync(
        string gameId, string userId, Func<GameDoc, string, GameActionResult> action)
    {
        var game = await games.GetAsync(gameId);
        if (game == null)
            return GameActionResult.Fail("Game not found.");
        if (game.OwnerUserId != userId)
            return GameActionResult.Fail("This is not your game.");

        var human = game.Players.First(p => p.IsHuman);
        var result = action(game, human.PlayerId);
        if (!result.Ok)
            return result;

        foreach (var e in result.Events)
        {
            e.GameId = game.Id!;
            e.Sequence = ++game.LastEventSequence;
        }

        if (!await games.SaveAsync(game))
            return GameActionResult.Fail("The game changed while you were acting. Please try again.");

        await events.AppendAsync(result.Events);
        return result;
    }
}
