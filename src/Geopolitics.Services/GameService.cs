using Geopolitics.Data;
using Geopolitics.Data.Models;
using Geopolitics.Data.Repositories;

namespace Geopolitics.Services;

public class GameService(IGameRepository games, IEventRepository events, CountryCatalog catalog)
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
}
