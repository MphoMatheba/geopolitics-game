namespace Geopolitics.Services;

// Built-in commentary: instant, free and always available. It is used on its
// own when no AI is configured, and as the fallback when the AI is slow or fails.
public static class TemplateCommentary
{
    public static IReadOnlyList<string> Lines(BattleScene scene)
    {
        var lines = new List<string>();
        for (int i = 0; i < scene.Rolls.Count; i++)
            lines.Add(Roll(scene, scene.Rolls[i], i));

        if (scene.Ending != null)
            lines.Add(Ending(scene, scene.Ending.Value));

        return lines;
    }

    private static string Roll(BattleScene s, RollSummary r, int index)
    {
        string attacker = s.AttackerCountry;
        string defender = s.DefenderCountry;

        if (r.AttackerLosses == 0 && r.DefenderLosses == 0)
            return $"A standoff at {defender}: every die ties and no soldier falls.";

        if (r.AttackerLosses > 0 && r.DefenderLosses > 0)
            return $"Both sides bleed: {attacker} loses {r.AttackerLosses} and {defender} loses {r.DefenderLosses}.";

        if (r.DefenderLosses > 0)
            return index % 2 == 0
                ? $"{attacker} presses forward and {defender} loses {r.DefenderLosses}."
                : $"The defence at {defender} buckles, with {r.DefenderLosses} soldier(s) down.";

        return index % 2 == 0
            ? $"{defender} holds the line and {attacker} loses {r.AttackerLosses}."
            : $"A setback for {attacker}, with {r.AttackerLosses} soldier(s) lost.";
    }

    private static string Ending(BattleScene s, BattleEnding ending) => ending switch
    {
        BattleEnding.Conquered => $"{s.DefenderCountry} has fallen to {s.AttackerCountry}!",
        BattleEnding.Failed => $"{s.AttackerCountry} runs out of steam and the attack on {s.DefenderCountry} collapses.",
        _ => $"{s.AttackerCountry} pulls back from {s.DefenderCountry} and ends the turn."
    };
}
