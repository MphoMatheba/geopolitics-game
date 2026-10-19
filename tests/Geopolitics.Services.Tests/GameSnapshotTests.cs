using System.Text.Json;
using Geopolitics.Data.Models;
using Geopolitics.Services;

namespace Geopolitics.Services.Tests;

public class GameSnapshotTests
{
    private static GameDoc OwnedGame()
    {
        var game = TestGames.NewGame();
        game.Id = "abc123";
        game.OwnerUserId = "owner1";
        return game;
    }

    [Fact]
    public void Snapshot_marks_the_owner_and_never_exposes_the_owner_id()
    {
        var game = OwnedGame();

        Assert.True(GameSnapshotFactory.From(game, "owner1").IsOwner);
        Assert.False(GameSnapshotFactory.From(game, "someone-else").IsOwner);
        Assert.False(GameSnapshotFactory.From(game, null).IsOwner);

        var json = JsonSerializer.Serialize(GameSnapshotFactory.From(game, "owner1"));
        Assert.DoesNotContain("owner1", json);
    }

    [Fact]
    public void Only_the_owner_can_play_and_only_on_their_own_turn()
    {
        var game = OwnedGame();

        game.CurrentPlayerIndex = game.Players.FindIndex(p => p.IsHuman);
        Assert.True(GameSnapshotFactory.From(game, "owner1").CanPlay);
        Assert.False(GameSnapshotFactory.From(game, "someone-else").CanPlay);
        Assert.False(GameSnapshotFactory.From(game, null).CanPlay);

        game.CurrentPlayerIndex = game.Players.FindIndex(p => !p.IsHuman);
        Assert.False(GameSnapshotFactory.From(game, "owner1").CanPlay);

        game.CurrentPlayerIndex = game.Players.FindIndex(p => p.IsHuman);
        game.Status = GameStatus.Won;
        Assert.False(GameSnapshotFactory.From(game, "owner1").CanPlay);
    }

    [Fact]
    public void Snapshot_lists_every_player_in_turn_order_and_every_country()
    {
        var snapshot = GameSnapshotFactory.From(OwnedGame(), null);

        Assert.Equal(10, snapshot.Players.Count);
        Assert.Equal(10, snapshot.Countries.Count);
        Assert.Equal(Enumerable.Range(0, 10), snapshot.Players.Select(p => p.TurnOrder));
    }

    [Fact]
    public void Event_view_keeps_the_dice_and_the_justification()
    {
        var e = new GameEvent
        {
            Sequence = 7,
            Type = GameEventType.DiceRolled,
            AttackerRolls = new List<int> { 1, 4 },
            DefenderRolls = new List<int> { 2, 3 },
            Justification = "Odds are still 62%.",
            Message = "rolled"
        };

        var view = GameSnapshotFactory.ToView(e);

        Assert.Equal("DiceRolled", view.Type);
        Assert.Equal(new[] { 1, 4 }, view.AttackerRolls);
        Assert.Equal("Odds are still 62%.", view.Justification);
    }
}
