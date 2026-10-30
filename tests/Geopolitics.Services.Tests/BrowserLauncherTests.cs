using Geopolitics.Services;

namespace Geopolitics.Services.Tests;

public class BrowserLauncherTests
{
    [Fact]
    public void Plain_http_is_preferred_over_https_because_it_needs_no_certificate()
    {
        var url = BrowserLauncher.ChooseUrl(new[] { "https://localhost:7099", "http://localhost:5033" });
        Assert.Equal("http://localhost:5033/", url);
    }

    [Fact]
    public void An_https_only_server_is_still_opened()
    {
        Assert.Equal("https://localhost:7099/", BrowserLauncher.ChooseUrl(new[] { "https://localhost:7099" }));
    }

    [Theory]
    [InlineData("http://0.0.0.0:8080", "http://localhost:8080/")]
    [InlineData("http://[::]:8080", "http://localhost:8080/")]
    [InlineData("http://+:8080", "http://localhost:8080/")]
    [InlineData("http://*:5000", "http://localhost:5000/")]
    public void Listen_on_every_address_wildcards_become_localhost(string listening, string expected)
    {
        Assert.Equal(expected, BrowserLauncher.ChooseUrl(new[] { listening }));
    }

    [Fact]
    public void The_port_and_a_real_address_are_kept()
    {
        Assert.Equal("http://127.0.0.1:6000/", BrowserLauncher.ChooseUrl(new[] { "nonsense", "http://127.0.0.1:6000" }));
    }

    [Fact]
    public void Nothing_usable_gives_no_address()
    {
        Assert.Null(BrowserLauncher.ChooseUrl(new[] { "", "  ", "ftp://example.org", "not a url" }));
        Assert.Null(BrowserLauncher.ChooseUrl(Array.Empty<string>()));
    }
}
