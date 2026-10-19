using System.Net;
using System.Text;
using Geopolitics.Services;

namespace Geopolitics.Services.Tests;

// Stands in for the internet: records the request and returns a canned reply.
internal class StubHandler(string responseJson, HttpStatusCode status = HttpStatusCode.OK) : HttpMessageHandler
{
    public string? Method { get; private set; }
    public string? Url { get; private set; }
    public string? ApiKey { get; private set; }
    public string? Version { get; private set; }
    public string? Body { get; private set; }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Method = request.Method.Method;
        Url = request.RequestUri?.ToString();
        ApiKey = request.Headers.GetValues("x-api-key").FirstOrDefault();
        Version = request.Headers.GetValues("anthropic-version").FirstOrDefault();
        Body = request.Content == null ? null : await request.Content.ReadAsStringAsync(cancellationToken);

        return new HttpResponseMessage(status)
        {
            Content = new StringContent(responseJson, Encoding.UTF8, "application/json")
        };
    }
}

public class ClaudeCommentatorTests
{
    private static BattleScene Scene() => new("Tester", "Alpha", "Beta",
        new[]
        {
            new RollSummary(new[] { 6, 2 }, new[] { 3, 5 }, 1, 1),
            new RollSummary(new[] { 5 }, new[] { 1 }, 0, 1)
        },
        BattleEnding.Conquered);

    // ----- reading the reply -----

    [Fact]
    public void A_plain_json_array_is_accepted()
    {
        var lines = ClaudeCommentator.ParseLines("[\"One\", \"Two\"]", 2);
        Assert.Equal(new[] { "One", "Two" }, lines);
    }

    [Fact]
    public void The_array_is_found_inside_extra_text_and_code_fences()
    {
        var reply = "Sure! Here you go:\n```json\n[\"A\", \"B\"]\n```";
        Assert.Equal(new[] { "A", "B" }, ClaudeCommentator.ParseLines(reply, 2));
    }

    [Fact]
    public void A_reply_with_the_wrong_number_of_lines_is_rejected()
    {
        Assert.Null(ClaudeCommentator.ParseLines("[\"A\"]", 2));
    }

    [Fact]
    public void A_reply_that_is_not_json_is_rejected()
    {
        Assert.Null(ClaudeCommentator.ParseLines("no array here", 1));
        Assert.Null(ClaudeCommentator.ParseLines("[not json]", 1));
    }

    [Fact]
    public void Very_long_lines_are_shortened()
    {
        var lines = ClaudeCommentator.ParseLines($"[\"{new string('x', 300)}\"]", 1);
        Assert.NotNull(lines);
        Assert.True(lines[0].Length <= 223);
    }

    // ----- building the prompt -----

    [Fact]
    public void The_prompt_lists_every_round_and_the_ending()
    {
        var prompt = ClaudeCommentator.BuildPrompt(Scene());

        Assert.Contains("Round 1", prompt);
        Assert.Contains("Round 2", prompt);
        Assert.Contains("[6, 2]", prompt);
        Assert.Contains("conquered", prompt);
        Assert.Contains("exactly 3 strings", prompt);
    }

    // ----- talking to the API -----

    [Fact]
    public async Task The_request_matches_the_Messages_API_and_the_reply_is_read()
    {
        var handler = new StubHandler(
            "{\"content\":[{\"type\":\"text\",\"text\":\"[\\\"Line one\\\",\\\"Line two\\\",\\\"Line three\\\"]\"}]}");
        var commentator = new ClaudeCommentator(
            new HttpClient(handler),
            new AnthropicSettings { ApiKey = "test-key", Model = "test-model" });

        var lines = await commentator.CommentAsync(Scene(), CancellationToken.None);

        Assert.Equal(new[] { "Line one", "Line two", "Line three" }, lines);
        Assert.Equal("POST", handler.Method);
        Assert.Equal(ClaudeCommentator.Endpoint, handler.Url);
        Assert.Equal("test-key", handler.ApiKey);
        Assert.Equal("2023-06-01", handler.Version);
        Assert.Contains("\"model\":\"test-model\"", handler.Body);
        Assert.Contains("\"max_tokens\"", handler.Body);
    }

    [Fact]
    public async Task An_http_error_is_raised_as_an_exception()
    {
        var handler = new StubHandler("{}", HttpStatusCode.InternalServerError);
        var commentator = new ClaudeCommentator(
            new HttpClient(handler), new AnthropicSettings { ApiKey = "k" });

        await Assert.ThrowsAsync<HttpRequestException>(() =>
            commentator.CommentAsync(Scene(), CancellationToken.None));
    }
}
