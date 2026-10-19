using Geopolitics.Data;
using Geopolitics.Data.Models;
using Geopolitics.Data.Repositories;
using Geopolitics.Engine;

namespace Geopolitics.Services;

public class GameService(
    IGameRepository games,
    IEventRepository events,
    CountryCatalog catalog,
    IDice dice,
    CommentaryService commentary)
{
    public async Task<GameDoc> CreateGameAsync(string ownerUserId, string humanName, string homeCountryCode)
    {
        var countries = catalog.PickGameCountries(
            homeCountryCode, GameFactory.CountriesPerGame - 1, Random.Shared);

        var game = GameFactory.Create(ownerUserId, humanName, countries, Random.Shared);
        TurnManager.BeginTurn(game);

        var order = string.Join(", ", game.Players.Select(p => p.DisplayName));
        var created = new List<GameEvent>
        {
            new()
            {
                Round = 1,
                Type = GameEventType.GameStarted,
                PlayerId = TurnManager.CurrentPlayer(game).PlayerId,
                Message = $"Game started. Turn order: {order}."
            }
        };

        // If an NPC goes first, play NPC turns until it is the human's turn.
        created.AddRange(NpcTurnRunner.PlayUntilHumanTurn(game, dice));

        await commentary.AnnotateAsync(game, created);

        for (int i = 0; i < created.Count; i++)
            created[i].Sequence = i + 1;
        game.LastEventSequence = created.Count;

        await games.CreateAsync(game);   // the driver fills in game.Id

        foreach (var e in created)
            e.GameId = game.Id!;
        await events.AppendAsync(created);

        return game;
    }

    // ---------- reading (public) ----------

    public Task<GameDoc?> GetGameAsync(string id) => games.GetAsync(id);

    public Task<List<GameEvent>> GetEventsAfterAsync(string id, int afterSequence) =>
        events.GetAfterAsync(id, afterSequence);

    public Task<List<GameDoc>> ListGamesAsync(string ownerUserId) =>
        games.ListByOwnerAsync(ownerUserId);

    // ---------- player actions (owner only) ----------

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
    // player, then (if the turn has passed to an NPC) plays NPC turns until it
    // is the human's turn again. Battle commentary is added, then everything is
    // saved in one go; the version check on save rejects the move if the game
    // changed in the meantime.
    private async Task<GameActionResult> ApplyAsync(
        string gameId, string userId, Func<GameDoc, string, GameActionResult> action)
    {
        var game = await games.GetAsync(gameId);
        if (game == null)
            return GameActionResult.Fail("Game not found.", ActionError.NotFound);
        if (game.OwnerUserId != userId)
            return GameActionResult.Fail("This is not your game.", ActionError.Forbidden);

        var human = game.Players.First(p => p.IsHuman);
        var result = action(game, human.PlayerId);
        if (!result.Ok)
            return result;

        var all = new List<GameEvent>(result.Events);
        if (game.Status == GameStatus.InProgress && !TurnManager.CurrentPlayer(game).IsHuman)
            all.AddRange(NpcTurnRunner.PlayUntilHumanTurn(game, dice));

        await commentary.AnnotateAsync(game, all);

        foreach (var e in all)
        {
            e.GameId = game.Id!;
            e.Sequence = ++game.LastEventSequence;
        }

        if (!await games.SaveAsync(game))
            return GameActionResult.Fail(
                "The game changed while you were acting. Please try again.", ActionError.Conflict);

        await events.AppendAsync(all);
        return GameActionResult.Success(all);
    }
}
