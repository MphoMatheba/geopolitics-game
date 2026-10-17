namespace Geopolitics.Engine;

public interface IDice
{
    int Roll();
}

public class RandomDice : IDice
{
    public int Roll() => Random.Shared.Next(1, 7);
}
