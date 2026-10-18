using Geopolitics.Data;
using Geopolitics.Data.Models;
using Geopolitics.Engine;

namespace Geopolitics.Services;

// Builds the starting state of a new game. Pure logic: no database, and the
// random source is passed in so tests can use a fixed seed.
public static class GameFactory
{
    public const int CountriesPerGame = 10;

    // countries[0] must be the human player's home country.
    public static GameDoc Create(
        string ownerUserId,
        string humanName,
        IReadOnlyList<CountryInfo> countries,
        Random rng)
    {
        if (countries.Count != CountriesPerGame)
            throw new ArgumentException($"A game needs exactly {CountriesPerGame} countries.", nameof(countries));
        if (countries.Select(c => c.Code).Distinct().Count() != countries.Count)
            throw new ArgumentException("Countries must be distinct.", nameof(countries));

        var players = new List<PlayerState>();
        var countryStates = new List<CountryState>();

        for (int i = 0; i < countries.Count; i++)
        {
            var country = countries[i];
            bool isHuman = i == 0;
            string playerId = isHuman ? "human" : $"npc-{i}";

            players.Add(new PlayerState
            {
                PlayerId = playerId,
                DisplayName = isHuman ? humanName : $"{country.Name} (NPC)",
                IsHuman = isHuman,
                HomeCountryCode = country.Code
            });

            countryStates.Add(new CountryState
            {
                Code = country.Code,
                Name = country.Name,
                Population = country.Population,
                OwnerPlayerId = playerId,
                Soldiers = SoldierTable.ForPopulation(country.Population)
            });
        }

        // Random turn order: shuffle, then number the players 0..9.
        var ordered = players.OrderBy(_ => rng.Next()).ToList();
        for (int i = 0; i < ordered.Count; i++)
            ordered[i].TurnOrder = i;

        return new GameDoc
        {
            OwnerUserId = ownerUserId,
            Players = ordered,
            Countries = countryStates,
            Round = 1,
            CurrentPlayerIndex = 0,
            Phase = TurnPhase.Action,
            PendingReinforcements = 0,
            Status = GameStatus.InProgress
        };
    }
}
