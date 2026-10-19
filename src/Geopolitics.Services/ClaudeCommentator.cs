using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Geopolitics.Services;

public class AnthropicSettings
{
    // Set with user-secrets locally or an environment variable in production.
    public string ApiKey { get; set; } = "";

    // A small, fast model is plenty for one-line commentary.
    public string Model { get; set; } = "claude-haiku-5-5";

    // How long the game will wait for commentary before using the built-in text.
    public int TimeoutSeconds { get; set; } = 8;
}

// Asks the Claude API (Messages API) for battle commentary, one request per
// battle, getting back one short line for every roll.
public class ClaudeCommentator(HttpClient http, AnthropicSettings settings) : ICommentator
{
    public const string Endpoint = "https://api.anthropic.com/v1/messages";

    private const string SystemPrompt =
        "You are a lively sports-style commentator for a Risk-like strategy game. " +
        "For every line requested, write ONE short, energetic sentence of at most 25 words. " +
        "Use only the facts you are given and never invent numbers. " +
        "Reply with ONLY a JSON array of strings, one per requested line, and no other text.";

    public async Task<IReadOnlyList<string>> CommentAsync(BattleScene scene, CancellationToken cancellationToken)
    {
        int expected = scene.LineCount;

        var body = new
        {
            model = settings.Model,
            max_tokens = Math.Min(2000, 80 * expected + 100),
            system = SystemPrompt,
            messages = new[] { new { role = "user", content = BuildPrompt(scene) } }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint)
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.Add("x-api-key", settings.ApiKey);
        request.Headers.Add("anthropic-version", "2023-06-01");

        using var response = await http.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
        var text = ExtractText(document.RootElement);

        return ParseLines(text, expected)
               ?? throw new InvalidOperationException("The commentary reply could not be used.");
    }

    public static string BuildPrompt(BattleScene scene)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"{scene.Attacker} attacks {scene.DefenderCountry} from {scene.AttackerCountry}.");

        for (int i = 0; i < scene.Rolls.Count; i++)
        {
            var r = scene.Rolls[i];
            sb.AppendLine(
                $"Round {i + 1}: attacker dice [{string.Join(", ", r.AttackerDice)}], " +
                $"defender dice [{string.Join(", ", r.DefenderDice)}]. " +
                $"Attacker lost {r.AttackerLosses}, defender lost {r.DefenderLosses}.");
        }

        if (scene.Ending != null)
            sb.AppendLine($"Final line, about the ending: {EndingText(scene.Ending.Value)}.");

        sb.AppendLine($"Reply with a JSON array of exactly {scene.LineCount} strings.");
        return sb.ToString();
    }

    private static string EndingText(BattleEnding ending) => ending switch
    {
        BattleEnding.Conquered => "the attacker conquered the country",
        BattleEnding.Failed => "the attacker ran out of soldiers and the attack failed",
        _ => "the attacker retreated and ended the turn"
    };

    private static string ExtractText(JsonElement root)
    {
        var sb = new StringBuilder();
        if (root.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.Array)
        {
            foreach (var block in content.EnumerateArray())
            {
                if (block.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String)
                    sb.Append(text.GetString());
            }
        }
        return sb.ToString();
    }

    // Finds the JSON array in the reply (the model may add stray text or a code
    // fence) and checks it has exactly the number of lines asked for.
    public static IReadOnlyList<string>? ParseLines(string text, int expected)
    {
        int start = text.IndexOf('[');
        int end = text.LastIndexOf(']');
        if (start < 0 || end <= start)
            return null;

        try
        {
            var items = JsonSerializer.Deserialize<List<string>>(text.Substring(start, end - start + 1));
            if (items == null || items.Count != expected)
                return null;

            var cleaned = items.Select(Clean).ToList();
            return cleaned.Any(string.IsNullOrWhiteSpace) ? null : cleaned;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string Clean(string? line)
    {
        var trimmed = (line ?? "").Trim();
        return trimmed.Length > 220 ? trimmed[..220].TrimEnd() + "..." : trimmed;
    }
}
