namespace Geopolitics.Engine;

public static class SoldierTable
{
    public static int ForPopulation(long population) => population switch
    {
        <= 5_000_000 => 1,
        <= 10_000_000 => 2,
        <= 25_000_000 => 3,
        <= 50_000_000 => 4,
        <= 75_000_000 => 5,
        <= 100_000_000 => 6,
        <= 125_000_000 => 7,
        <= 150_000_000 => 8,
        _ => 9
    };
}
