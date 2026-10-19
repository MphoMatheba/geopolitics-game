using Geopolitics.Data.Models;

namespace Geopolitics.Services;

// Turns game events into battle commentary. Nothing here can hold up or break
// a game: every battle gets built-in commentary straight away, and the AI
// (when configured) then tries to replace it, but only within the time budget.
public record SceneGroup(BattleScene Scene, List<GameEvent> Targets);

public class CommentaryService(ICommentator? ai, TimeSpan budget)
{
    private const int MaxParallelBattles = 4;
    private const int MaxLinesForAi = 40;

    public async Task AnnotateAsync(GameDoc game, IReadOnlyList<GameEvent> events)
    {
        var scenes = BuildScenes(game, events);

        // 1. Built-in commentary for everything, so nothing is ever blank.
        foreach (var group in scenes)
            Apply(group, TemplateCommentary.Lines(group.Scene));

        if (ai == null || scenes.Count == 0)
            return;

        // 2. Ask the AI, several battles at a time, within the time budget.
        using var timeout = new CancellationTokenSource(budget);
        using var gate = new SemaphoreSlim(MaxParallelBattles);

        var work = scenes
            .Where(g => g.Scene.LineCount <= MaxLinesForAi)
            .Select(async group =>
            {
                try { await gate.WaitAsync(timeout.Token); }
                catch (OperationCanceledException) { return; }

                try
                {
                    var lines = await ai.CommentAsync(group.Scene, timeout.Token);
                    if (!timeout.IsCancellationRequested && lines.Count == group.Targets.Count)
                        Apply(group, lines);
                }
                catch (Exception)
                {
                    // Keep the built-in text if the AI fails for any reason.
                }
                finally
                {
                    gate.Release();
                }
            })
            .ToList();

        await Task.WhenAll(work);
    }

    private static void Apply(SceneGroup group, IReadOnlyList<string> lines)
    {
        for (int i = 0; i < group.Targets.Count && i < lines.Count; i++)
            group.Targets[i].Commentary = lines[i];
    }

    // Groups consecutive dice rolls between the same two countries into one
    // battle. A conquest or the end of an attack closes the battle.
    public static List<SceneGroup> BuildScenes(GameDoc game, IReadOnlyList<GameEvent> events)
    {
        var result = new List<SceneGroup>();
        List<GameEvent>? rolls = null;

        void Flush(GameEvent? closing)
        {
            if (rolls == null || rolls.Count == 0)
            {
                rolls = null;
                return;
            }

            var first = rolls[0];
            BattleEnding? ending = closing == null ? null
                : closing.Type == GameEventType.CountryConquered ? BattleEnding.Conquered
                : closing.AttackerCode != null ? BattleEnding.Failed
                : BattleEnding.Retreated;

            var scene = new BattleScene(
                PlayerName(game, first.PlayerId),
                CountryName(game, first.AttackerCode),
                CountryName(game, first.DefenderCode),
                rolls.Select(r => new RollSummary(r.AttackerRolls, r.DefenderRolls, r.AttackerLosses, r.DefenderLosses)).ToList(),
                ending);

            var targets = new List<GameEvent>(rolls);
            if (closing != null)
                targets.Add(closing);

            result.Add(new SceneGroup(scene, targets));
            rolls = null;
        }

        foreach (var e in events)
        {
            switch (e.Type)
            {
                case GameEventType.DiceRolled:
                    if (rolls != null
                        && (rolls[0].PlayerId != e.PlayerId
                            || rolls[0].AttackerCode != e.AttackerCode
                            || rolls[0].DefenderCode != e.DefenderCode))
                        Flush(null);
                    (rolls ??= new()).Add(e);
                    break;

                case GameEventType.CountryConquered:
                case GameEventType.AttackEnded:
                    if (rolls != null && rolls[0].PlayerId == e.PlayerId)
                        Flush(e);
                    else
                        Flush(null);
                    break;

                default:
                    Flush(null);
                    break;
            }
        }

        Flush(null);
        return result;
    }

    private static string PlayerName(GameDoc game, string playerId) =>
        game.Players.FirstOrDefault(p => p.PlayerId == playerId)?.DisplayName ?? playerId;

    private static string CountryName(GameDoc game, string? code) =>
        game.Countries.FirstOrDefault(c => c.Code == code)?.Name ?? code ?? "the defender";
}
