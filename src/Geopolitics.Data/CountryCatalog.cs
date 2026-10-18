using System.Text.Json;

namespace Geopolitics.Data;

public record CountryInfo(string Code, string Name, long Population);

public class CountryCatalog
{
    private readonly List<CountryInfo> _countries;

    public CountryCatalog()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Seed", "countries.json");
        var json = File.ReadAllText(path);
        _countries = JsonSerializer.Deserialize<List<CountryInfo>>(
            json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidOperationException("countries.json could not be read.");
    }

    public IReadOnlyList<CountryInfo> All => _countries;

    public CountryInfo? Find(string code) =>
        _countries.FirstOrDefault(c => c.Code == code);

    // The player's country plus `count` other distinct random countries.
    public List<CountryInfo> PickGameCountries(string homeCode, int count, Random rng)
    {
        var home = Find(homeCode) ?? throw new ArgumentException("Unknown country.", nameof(homeCode));
        var others = _countries.Where(c => c.Code != homeCode)
                               .OrderBy(_ => rng.Next()).Take(count).ToList();
        others.Insert(0, home);
        return others;
    }
}
