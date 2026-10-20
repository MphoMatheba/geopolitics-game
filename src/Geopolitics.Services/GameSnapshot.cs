using Geopolitics.Data.Models;

namespace Geopolitics.Services;

// What the outside world is allowed to see of a game. These are separate from
// the stored documents so private data (such as the owner's user id) never leaks.

public record PlayerView(string PlayerId, string Name, bool IsHuman, bool IsEliminated, int TurnOrder, int CountriesOwned);

public record CountryView(string Code, string Name, long Population, string OwnerPlayerId, int Soldiers);

public record ActiveAttackView(string AttackerCode, string DefenderCode);

public record EventView(
    int Sequence,
    int Round,
    string Type,
    string PlayerId,
    string? AttackerCode,
    string? DefenderCode,
    IReadOnlyList<int> AttackerRolls,
    IReadOnlyList<int> DefenderRolls,
    int AttackerLosses,
    int DefenderLosses,
    string Message,
    string? Justification,
    string? Commentary,
    string? FromCode = null,
    string? ToCode = null,
    int Count = 0);

public record GameSnapshot(
    string Id,
    string Status,
    int Round,
    string Phase,
    string CurrentPlayerId,
    int PendingReinforcements,
    bool HasAttackedThisTurn,
    ActiveAttackView? ActiveAttack,
    int LastEventSequence,
    bool IsOwner,
    bool CanPlay,
    IReadOnlyList<PlayerView> Players,
    IReadOnlyList<CountryView> Countries);

public static class GameSnapshotFactory
{
    // viewerUserId is null for visitors who are not logged in.
    public static GameSnapshot From(GameDoc g, string? viewerUserId)
    {
        bool isOwner = viewerUserId != null && viewerUserId == g.OwnerUserId;
        var current = TurnManager.CurrentPlayer(g);
        bool canPlay = isOwner && g.Status == GameStatus.InProgress && current.IsHuman;

        var players = g.Players
            .OrderBy(p => p.TurnOrder)
            .Select(p => new PlayerView(
                p.PlayerId, p.DisplayName, p.IsHuman, p.IsEliminated, p.TurnOrder,
                TurnManager.CountriesOwned(g, p.PlayerId)))
            .ToList();

        var countries = g.Countries
            .Select(c => new CountryView(c.Code, c.Name, c.Population, c.OwnerPlayerId, c.Soldiers))
            .ToList();

        var attack = g.ActiveAttack == null
            ? null
            : new ActiveAttackView(g.ActiveAttack.AttackerCode, g.ActiveAttack.DefenderCode);

        return new GameSnapshot(
            g.Id ?? "",
            g.Status.ToString(),
            g.Round,
            g.Phase.ToString(),
            current.PlayerId,
            g.PendingReinforcements,
            g.HasAttackedThisTurn,
            attack,
            g.LastEventSequence,
            isOwner,
            canPlay,
            players,
            countries);
    }

    public static EventView ToView(GameEvent e) => new(
        e.Sequence,
        e.Round,
        e.Type.ToString(),
        e.PlayerId,
        e.AttackerCode,
        e.DefenderCode,
        e.AttackerRolls,
        e.DefenderRolls,
        e.AttackerLosses,
        e.DefenderLosses,
        e.Message,
        e.Justification,
        e.Commentary,
        e.FromCode,
        e.ToCode,
        e.Count);
}
