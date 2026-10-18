using Geopolitics.Engine;

namespace Geopolitics.Services.Tests;

// Returns the given rolls in order, so battles are predictable in tests.
internal class FakeDice(params int[] rolls) : IDice
{
    private readonly Queue<int> _rolls = new(rolls);
    public int Roll() => _rolls.Dequeue();
}
