using Geopolitics.Engine;
using Geopolitics.Services;

namespace Geopolitics.Services.Tests;

public class OddsTests
{
    [Theory]
    [InlineData(6, 4)]
    [InlineData(3, 3)]
    [InlineData(10, 2)]
    public void Conquest_chance_matches_a_simulation_of_the_real_engine(int attackers, int defenders)
    {
        var dice = new SeededDice(1234);
        const int trials = 20000;
        int conquered = 0;

        for (int t = 0; t < trials; t++)
        {
            var attacker = new Geopolitics.Engine.Country("a", "A", 0, "p1", attackers);
            var defender = new Geopolitics.Engine.Country("d", "D", 0, "p2", defenders);

            BattleOutcome outcome;
            do
            {
                outcome = BattleEngine.ResolveRound(attacker, defender, dice).Outcome;
            }
            while (outcome == BattleOutcome.Continue);

            if (outcome == BattleOutcome.Conquered) conquered++;
        }

        Assert.Equal(Odds.ConquestChance(attackers, defenders), conquered / (double)trials, 0.02);
    }

    [Fact]
    public void Two_soldiers_against_one_is_an_even_fight()
    {
        // One die each, attacker needs to win before losing: 15/36 against 15/36.
        Assert.Equal(0.5, Odds.ConquestChance(2, 1), 1e-9);
    }

    [Fact]
    public void Boundary_cases()
    {
        Assert.Equal(0.0, Odds.ConquestChance(1, 5));   // cannot attack with 1 soldier
        Assert.Equal(1.0, Odds.ConquestChance(5, 0));   // nothing left to defend
    }

    [Fact]
    public void More_attackers_means_better_odds()
    {
        Assert.True(Odds.ConquestChance(8, 5) > Odds.ConquestChance(6, 5));
        Assert.True(Odds.ConquestChance(6, 5) > Odds.ConquestChance(4, 5));
    }
}
