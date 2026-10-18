using Geopolitics.Data.Models;

namespace Geopolitics.Services;

// The outcome of a player action: either a rejection with a reason, or the
// events that describe what happened (to be stored and shown to viewers).
public record GameActionResult(bool Ok, string? Error, IReadOnlyList<GameEvent> Events)
{
    public static GameActionResult Fail(string error) =>
        new(false, error, Array.Empty<GameEvent>());

    public static GameActionResult Success(IEnumerable<GameEvent> events) =>
        new(true, null, events.ToList());
}
