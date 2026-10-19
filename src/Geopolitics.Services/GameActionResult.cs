using Geopolitics.Data.Models;

namespace Geopolitics.Services;

// Why a move was rejected, so the web layer can pick the right status code.
public enum ActionError { None, Rule, NotFound, Forbidden, Conflict }

// The outcome of a player action: either a rejection with a reason, or the
// events that describe what happened (to be stored and shown to viewers).
public record GameActionResult(
    bool Ok,
    string? Error,
    IReadOnlyList<GameEvent> Events,
    ActionError Kind = ActionError.None)
{
    public static GameActionResult Fail(string error, ActionError kind = ActionError.Rule) =>
        new(false, error, Array.Empty<GameEvent>(), kind);

    public static GameActionResult Success(IEnumerable<GameEvent> events) =>
        new(true, null, events.ToList());
}
