namespace Geopolitics.Engine;

public class Country
{
    public string Code { get; }
    public string Name { get; }
    public long Population { get; }
    public string OwnerId { get; private set; }
    public int Soldiers { get; private set; }

    public Country(string code, string name, long population, string ownerId, int? soldiers = null)
    {
        Code = code;
        Name = name;
        Population = population;
        OwnerId = ownerId;
        Soldiers = soldiers ?? SoldierTable.ForPopulation(population);
    }

    public void AddSoldiers(int count)
    {
        if (count < 0) throw new ArgumentOutOfRangeException(nameof(count));
        Soldiers += count;
    }

    public void RemoveSoldiers(int count)
    {
        if (count < 0 || count > Soldiers) throw new ArgumentOutOfRangeException(nameof(count));
        Soldiers -= count;
    }

    public void Capture(string newOwnerId, int startingSoldiers)
    {
        OwnerId = newOwnerId;
        Soldiers = startingSoldiers;
    }

    public static void Transfer(Country from, Country to, int count)
    {
        if (from.OwnerId != to.OwnerId)
            throw new InvalidOperationException("Can only transfer between countries you control.");
        if (count < 1 || from.Soldiers - count < 1)
            throw new InvalidOperationException("A country must keep at least 1 soldier.");
        from.RemoveSoldiers(count);
        to.AddSoldiers(count);
    }
}
