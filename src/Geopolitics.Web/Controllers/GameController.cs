using Geopolitics.Data;
using Geopolitics.Engine;
using Geopolitics.Services;
using Geopolitics.Web.Extensions;
using Geopolitics.Web.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;

namespace Geopolitics.Web.Controllers;

public class GameController(GameService games, CountryCatalog catalog) : Controller
{
    private const string DefaultCountry = "south-africa";

    private NewGameViewModel BuildNewGameModel(string? selected = null)
    {
        var chosen = selected ?? DefaultCountry;
        return new NewGameViewModel
        {
            HomeCountryCode = chosen,
            Countries = catalog.All
                .OrderBy(c => c.Name)
                .Select(c => new SelectListItem(
                    $"{c.Name} ({SoldierTable.ForPopulation(c.Population)} soldiers)", c.Code, c.Code == chosen))
                .ToList()
        };
    }

    [Authorize, HttpGet]
    public IActionResult New() => View(BuildNewGameModel());

    [Authorize, HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Create(NewGameViewModel model)
    {
        if (!ModelState.IsValid || catalog.Find(model.HomeCountryCode) == null)
        {
            ModelState.AddModelError(nameof(model.HomeCountryCode), "Choose a country from the list.");
            return View("New", BuildNewGameModel());
        }

        var game = await games.CreateGameAsync(User.GetUserId(), User.Identity!.Name!, model.HomeCountryCode);
        return RedirectToAction(nameof(Details), new { id = game.Id });
    }

    [Authorize, HttpGet]
    public async Task<IActionResult> My() =>
        View(await games.ListGamesAsync(User.GetUserId()));

    // Public: anyone with the link can watch. Playing needs the owner's login,
    // which the API enforces.
    [HttpGet("g/{id}")]
    public async Task<IActionResult> Details(string id)
    {
        var game = await games.GetGameAsync(id);
        if (game == null)
            return NotFound();

        return View(model: id);
    }
}
