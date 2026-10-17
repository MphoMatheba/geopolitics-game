using Geopolitics.Engine;

namespace Geopolitics.Engine.Tests;

class FakeDice(params int[] rolls) : IDice
{
    private readonly Queue<int> _rolls = new(rolls);
    public int Roll() => _rolls.Dequeue();
}

public class SoldierTableTests
{
    [Theory]
    [InlineData(5_000_000, 1)]
    [InlineData(5_000_001, 2)]
    [InlineData(150_000_000, 8)]
    [InlineData(150_000_001, 9)]
    [InlineData(1_400_000_000, 9)]
    public void MapsPopulationToSoldiers(long population, int expected) =>
        Assert.Equal(expected, SoldierTable.ForPopulation(population));
}

public class BattleEngineTests
{
    [Fact]
    public void SpecExample_BothSidesLoseOne()
    {
        var a = new Country("A", "Attacker", 0, "p1", 10);
        var d = new Country("D", "Defender", 0, "p2", 2);
        var round = BattleEngine.ResolveRound(a, d, new FakeDice(1, 4, 2, 3));
        Assert.Equal(9, a.Soldiers);
        Assert.Equal(1, d.Soldiers);
        Assert.Equal(BattleOutcome.Continue, round.Outcome);
    }

    [Fact]
    public void Tie_NoOneLoses()
    {
        var a = new Country("A", "Attacker", 0, "p1", 3);
        var d = new Country("D", "Defender", 0, "p2", 3);
        BattleEngine.ResolveRound(a, d, new FakeDice(3, 3, 3, 3));
        Assert.Equal(3, a.Soldiers);
        Assert.Equal(3, d.Soldiers);
    }

    [Fact]
    public void AttackerWithTwoVsFive_RollsOneDie_AndCanBeExhausted()
    {
        var a = new Country("A", "Attacker", 0, "p1", 2);
        var d = new Country("D", "Defender", 0, "p2", 5);
        var round = BattleEngine.ResolveRound(a, d, new FakeDice(1, 6));
        Assert.Single(round.AttackerRolls);
        Assert.Equal(1, a.Soldiers);
        Assert.Equal(BattleOutcome.AttackerExhausted, round.Outcome);
    }

    [Fact]
    public void DefenderReachingZero_IsConquered()
    {
        var a = new Country("A", "Attacker", 0, "p1", 5);
        var d = new Country("D", "Defender", 0, "p2", 1);
        var round = BattleEngine.ResolveRound(a, d, new FakeDice(6, 1));
        Assert.Equal(BattleOutcome.Conquered, round.Outcome);
    }

    [Theory]
    [InlineData(9, 4)]
    [InlineData(1, 2)]
    [InlineData(5, 2)]
    public void ConquestReward_IsMaxOfTwoOrHalf(int defenderSoldiers, int expected) =>
        Assert.Equal(expected, BattleEngine.ConquestReward(defenderSoldiers));

    [Fact]
    public void Transfer_MustLeaveOneSoldierBehind()
    {
        var x = new Country("X", "X", 0, "p1", 3);
        var y = new Country("Y", "Y", 0, "p1", 1);
        Assert.Throws<InvalidOperationException>(() => Country.Transfer(x, y, 3));
        Country.Transfer(x, y, 2);
        Assert.Equal(1, x.Soldiers);
        Assert.Equal(3, y.Soldiers);
    }
}
