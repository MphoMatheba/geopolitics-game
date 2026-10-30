using System.Diagnostics;

namespace Geopolitics.Services;

/// <summary>
/// Opens the game in the default web browser when the app starts. It is done by the app itself (not by an IDE
/// setting), so it behaves the same from Visual Studio, Rider, VS Code or the command line, on Windows, macOS and Linux.
/// </summary>
public static class BrowserLauncher
{
    /// <summary>
    /// Picks the address to open from the addresses the server listens on. Plain http on localhost is preferred,
    /// because it needs no certificate; "every address" wildcards are turned into localhost.
    /// </summary>
    public static string? ChooseUrl(IEnumerable<string> addresses)
    {
        var usable = addresses.Select(Normalise).OfType<string>().ToList();
        return usable.FirstOrDefault(a => a.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
               ?? usable.FirstOrDefault();
    }

    // 0.0.0.0, [::], + and * all mean "listen on every address", which a browser cannot visit.
    private static string? Normalise(string? address)
    {
        if (string.IsNullOrWhiteSpace(address)) return null;
        var url = address.Trim()
            .Replace("://0.0.0.0", "://localhost")
            .Replace("://[::]", "://localhost")
            .Replace("://+", "://localhost")
            .Replace("://*", "://localhost");
        if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed)) return null;
        if (parsed.Scheme != Uri.UriSchemeHttp && parsed.Scheme != Uri.UriSchemeHttps) return null;
        return url.TrimEnd('/') + "/";
    }

    /// <summary>Asks the operating system to open the address in the default browser. Returns false if it could not.</summary>
    public static bool TryOpen(string url)
    {
        try
        {
            if (OperatingSystem.IsWindows())
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            else if (OperatingSystem.IsMacOS())
                Process.Start("open", url);
            else
                Process.Start("xdg-open", url);
            return true;
        }
        catch
        {
            return false;                       // no browser, no desktop (a server): the caller prints the address instead
        }
    }
}
