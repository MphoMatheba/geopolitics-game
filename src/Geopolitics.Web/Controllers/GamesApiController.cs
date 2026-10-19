using Geopolitics.Services;
using Geopolitics.Web.Extensions;
using Geopolitics.Web.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Geopolitics.Web.Controllers;

// Reading a game is public. Every move needs a logged-in user, and the game
// service then checks that the user owns the game.
[ApiController]
[Route("api/games")]
public class GamesApiController(GameService games) : ControllerBase
{
    private string UserId => User.GetUserId();

    private string? ViewerId =>
        User.Identity?.IsAuthenticated == true ? User.GetUserId() : null;

    // ---------- public reads ----------

    [HttpGet("{id}")]
    public async Task<ActionResult<GameSnapshot>> Get(string id)
    {
        var game = await games.GetGameAsync(id);
        if (game == null)
            return NotFound(new ErrorResponse("Game not found."));

        return GameSnapshotFactory.From(game, ViewerId);
    }

    [HttpGet("{id}/events")]
    public async Task<ActionResult<List<EventView>>> Events(string id, [FromQuery] int after = 0)
    {
        if (await games.GetGameAsync(id) == null)
            return NotFound(new ErrorResponse("Game not found."));

        var events = await games.GetEventsAfterAsync(id, Math.Max(0, after));
        return events.Select(GameSnapshotFactory.ToView).ToList();
    }

    // ---------- moves (owner only) ----------
    // JSON only: a form on another site cannot send application/json, which,
    // together with SameSite cookies, stops cross-site request forgery.

    [Authorize, HttpPost("{id}/reinforce"), Consumes("application/json")]
    public Task<IActionResult> Reinforce(string id, ReinforceRequest request) =>
        Respond(id, games.ReinforceAsync(id, UserId, request.CountryCode, request.Count));

    [Authorize, HttpPost("{id}/transfer"), Consumes("application/json")]
    public Task<IActionResult> Transfer(string id, TransferRequest request) =>
        Respond(id, games.TransferAsync(id, UserId, request.FromCode, request.ToCode, request.Count));

    [Authorize, HttpPost("{id}/attack"), Consumes("application/json")]
    public Task<IActionResult> Attack(string id, AttackRequest request) =>
        Respond(id, games.StartAttackAsync(id, UserId, request.AttackerCode, request.DefenderCode));

    [Authorize, HttpPost("{id}/roll"), Consumes("application/json")]
    public Task<IActionResult> Roll(string id) =>
        Respond(id, games.RollAsync(id, UserId));

    [Authorize, HttpPost("{id}/stop"), Consumes("application/json")]
    public Task<IActionResult> Stop(string id) =>
        Respond(id, games.StopAttackAsync(id, UserId));

    [Authorize, HttpPost("{id}/end"), Consumes("application/json")]
    public Task<IActionResult> End(string id) =>
        Respond(id, games.EndTurnAsync(id, UserId));

    private async Task<IActionResult> Respond(string id, Task<GameActionResult> pending)
    {
        var result = await pending;
        if (!result.Ok)
            return StatusFor(result);

        var game = await games.GetGameAsync(id);
        var snapshot = game == null ? null : GameSnapshotFactory.From(game, ViewerId);
        var events = result.Events.Select(GameSnapshotFactory.ToView).ToList();
        return Ok(new ActionResponse(snapshot, events));
    }

    private IActionResult StatusFor(GameActionResult result) => result.Kind switch
    {
        ActionError.NotFound => NotFound(new ErrorResponse(result.Error!)),
        ActionError.Forbidden => StatusCode(StatusCodes.Status403Forbidden, new ErrorResponse(result.Error!)),
        ActionError.Conflict => Conflict(new ErrorResponse(result.Error!)),
        _ => BadRequest(new ErrorResponse(result.Error!))
    };
}
