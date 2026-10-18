using Geopolitics.Engine;

namespace Geopolitics.Services.Tests;

// Random dice that repeat the same sequence for the same seed.
internal class SeededDice(int seed) : IDice
{
    private readonly Random _random = new(seed);
    public int Roll() => _random.Next(1, 7);
}
