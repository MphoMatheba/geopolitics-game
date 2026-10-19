using System.Diagnostics;
using Geopolitics.Data.Models;
using Geopolitics.Services;

namespace Geopolitics.Services.Tests;

internal class FakeCommentator(Func<BattleScene, CancellationToken, Task<IReadOnlyList<string>>> reply) : ICommentator
{
    public Task<IReadOnlyList<string>> CommentAsync(BattleScene scene, CancellationToken cancellationToken) =>
        reply(scene, cancellationToken);
}

public class CommentaryServiceTests
{
    private static GameEvent Roll(string player, string from, string to, int attackerLosses, int defenderLosses) => new()
    {
        Type = GameEventType.DiceRolled,
        PlayerId = player,
        AttackerCode = from,
        DefenderCode = to,
        AttackerRolls = new List<int> { 4 },
        DefenderRolls = new List<int> { 2 },
        AttackerLosses = attackerLosses,
        DefenderLosses = defenderLosses
    };

    private static GameEvent Other(GameEventType type, string player, string? from = null, string? to = null) => new()
    {
        Type = type,
        PlayerId = player,
        AttackerCode = from,
        DefenderCode = to
    };

    private static RollSummary Summary(int attackerLosses, int defenderLosses) =>
        new(new[] { 4 }, new[] { 2 }, attackerLosses, defenderLosses);

    // ----- built-in commentary -----

    [Fact]
    public void Built_in_commentary_covers_every_roll_and_the_ending()
    {
        var scene = new BattleScene("Tester", "Alpha", "Beta",
            new[] { Summary(0, 1), Summary(1, 0) }, BattleEnding.Conquered);

        var lines = TemplateCommentary.Lines(scene);

        Assert.Equal(3, lines.Count);
        Assert.All(lines, l => Assert.False(string.IsNullOrWhiteSpace(l)));
        Assert.Contains("Beta", lines[2]);
    }

    [Fact]
    public void Built_in_commentary_describes_each_kind_of_roll_differently()
    {
        var scene = new BattleScene("Tester", "Alpha", "Beta",
            new[] { Summary(0, 0), Summary(1, 1), Summary(0, 1), Summary(1, 0) }, null);

        var lines = TemplateCommentary.Lines(scene);

        Assert.Equal(4, lines.Distinct().Count());
    }

    // ----- grouping events into battles -----

    [Fact]
    public void Rolls_and_the_conquest_form_one_battle()
    {
        var game = TestGames.NewGame();
        var events = new List<GameEvent>
        {
            Other(GameEventType.AttackStarted, "human", "c0", "c1"),
            Roll("human", "c0", "c1", 0, 1),
            Roll("human", "c0", "c1", 0, 1),
            Roll("human", "c0", "c1", 1, 0),
            Other(GameEventType.CountryConquered, "human", "c0", "c1"),
            Other(GameEventType.PlayerEliminated, "npc-1")
        };

        var scenes = CommentaryService.BuildScenes(game, events);

        var group = Assert.Single(scenes);
        Assert.Equal(3, group.Scene.Rolls.Count);
        Assert.Equal(BattleEnding.Conquered, group.Scene.Ending);
        Assert.Equal(4, group.Targets.Count);   // three rolls and the conquest
    }

    [Fact]
    public void Different_attacks_make_separate_battles()
    {
        var game = TestGames.NewGame();
        var events = new List<GameEvent>
        {
            Roll("human", "c0", "c1", 0, 1),
            Roll("human", "c0", "c1", 0, 1),
            Other(GameEventType.TurnSkipped, "human"),
            Roll("npc-1", "c2", "c3", 1, 0)
        };

        var scenes = CommentaryService.BuildScenes(game, events);

        Assert.Equal(2, scenes.Count);
        Assert.Equal(2, scenes[0].Scene.Rolls.Count);
        Assert.Null(scenes[1].Scene.Ending);
    }

    [Fact]
    public void Stopping_an_attack_closes_the_battle_as_a_retreat()
    {
        var game = TestGames.NewGame();
        var events = new List<GameEvent>
        {
            Roll("human", "c0", "c1", 1, 0),
            Other(GameEventType.AttackEnded, "human")   // no country codes: the player stopped
        };

        var group = Assert.Single(CommentaryService.BuildScenes(game, events));

        Assert.Equal(BattleEnding.Retreated, group.Scene.Ending);
        Assert.Equal(2, group.Targets.Count);
    }

    [Fact]
    public void Running_out_of_soldiers_closes_the_battle_as_a_failed_attack()
    {
        var game = TestGames.NewGame();
        var events = new List<GameEvent>
        {
            Roll("human", "c0", "c1", 1, 0),
            Other(GameEventType.AttackEnded, "human", "c0", "c1")   // with codes: ran out of soldiers
        };

        var group = Assert.Single(CommentaryService.BuildScenes(game, events));

        Assert.Equal(BattleEnding.Failed, group.Scene.Ending);
    }

    // ----- attaching commentary -----

    private static List<GameEvent> OneConquest() => new()
    {
        Roll("human", "c0", "c1", 0, 1),
        Other(GameEventType.CountryConquered, "human", "c0", "c1")
    };

    [Fact]
    public async Task Without_an_ai_the_built_in_commentary_is_still_attached()
    {
        var service = new CommentaryService(null, TimeSpan.FromSeconds(1));
        var events = OneConquest();

        await service.AnnotateAsync(TestGames.NewGame(), events);

        Assert.All(events, e => Assert.False(string.IsNullOrWhiteSpace(e.Commentary)));
    }

    [Fact]
    public async Task Ai_lines_replace_the_built_in_text()
    {
        var ai = new FakeCommentator((_, _) =>
            Task.FromResult<IReadOnlyList<string>>(new[] { "AI line one", "AI line two" }));
        var service = new CommentaryService(ai, TimeSpan.FromSeconds(5));
        var events = OneConquest();

        await service.AnnotateAsync(TestGames.NewGame(), events);

        Assert.Equal("AI line one", events[0].Commentary);
        Assert.Equal("AI line two", events[1].Commentary);
    }

    [Fact]
    public async Task An_ai_failure_keeps_the_built_in_text()
    {
        var ai = new FakeCommentator((_, _) => throw new InvalidOperationException("boom"));
        var service = new CommentaryService(ai, TimeSpan.FromSeconds(5));
        var events = OneConquest();

        await service.AnnotateAsync(TestGames.NewGame(), events);

        Assert.All(events, e => Assert.False(string.IsNullOrWhiteSpace(e.Commentary)));
    }

    [Fact]
    public async Task An_ai_reply_with_the_wrong_number_of_lines_is_ignored()
    {
        var ai = new FakeCommentator((_, _) =>
            Task.FromResult<IReadOnlyList<string>>(new[] { "only one line" }));
        var service = new CommentaryService(ai, TimeSpan.FromSeconds(5));
        var events = OneConquest();

        await service.AnnotateAsync(TestGames.NewGame(), events);

        Assert.NotEqual("only one line", events[0].Commentary);
        Assert.All(events, e => Assert.False(string.IsNullOrWhiteSpace(e.Commentary)));
    }

    [Fact]
    public async Task A_slow_ai_is_abandoned_within_the_time_budget()
    {
        var ai = new FakeCommentator(async (_, ct) =>
        {
            await Task.Delay(Timeout.Infinite, ct);
            return new[] { "never" };
        });
        var service = new CommentaryService(ai, TimeSpan.FromMilliseconds(200));
        var events = OneConquest();

        var clock = Stopwatch.StartNew();
        await service.AnnotateAsync(TestGames.NewGame(), events);
        clock.Stop();

        Assert.True(clock.Elapsed < TimeSpan.FromSeconds(5), $"took {clock.Elapsed}");
        Assert.All(events, e => Assert.False(string.IsNullOrWhiteSpace(e.Commentary)));
    }
}
