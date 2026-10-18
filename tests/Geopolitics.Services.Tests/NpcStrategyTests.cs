using Geopolitics.Data.Models;
using Geopolitics.Services;

namespace Geopolitics.Services.Tests;

public class NpcStrategyTests
{
    // A board where the current player's country has 10 soldiers and every
    // other country has `others` soldiers.
    private static (GameDoc game, string me) Board(int others)
    {
        var game = TestGames.NewGame();
        var me = TurnManager.CurrentPlayer(game).PlayerId;
        foreach (var c in game.Countries)
            c.Soldiers = c.OwnerPlayerId == me ? 10 : others;
        return (game, me);
    }

    [Fact]
    public void Attack_choice_goes_for_the_weak_target()
    {
        var (game, me) = Board(20);
        var weak = game.Countries.First(c => c.OwnerPlayerId != me);
        weak.Soldiers = 1;

        var plan = NpcStrategy.ChooseAttack(game, me);

        Assert.NotNull(plan);
        Assert.Equal(weak.Code, plan.DefenderCode);
        Assert.True(plan.WinChance > 0.9);
        Assert.False(string.IsNullOrWhiteSpace(plan.Justification));
    }

    [Fact]
    public void No_attack_when_every_target_is_too_strong()
    {
        var (game, me) = Board(20);
        Assert.Null(NpcStrategy.ChooseAttack(game, me));
    }

    [Fact]
    public void Reinforcements_go_to_the_country_that_sets_up_the_best_attack()
    {
        var (game, me) = Board(20);
        var a = game.Countries.Single(c => c.OwnerPlayerId == me);
        var b = game.Countries.First(c => c.OwnerPlayerId != me);
        b.OwnerPlayerId = me;
        a.Soldiers = 5;
        b.Soldiers = 2;

        var target = game.Countries.First(c => c.OwnerPlayerId != me);
        target.Soldiers = 4;
        game.PendingReinforcements = 4;

        var plan = NpcStrategy.ChooseReinforcement(game, me);

        Assert.Equal(a.Code, plan.CountryCode);
    }

    [Fact]
    public void Reinforcements_shore_up_the_weakest_country_when_no_attack_is_good()
    {
        var (game, me) = Board(20);
        game.PendingReinforcements = 3;

        var plan = NpcStrategy.ChooseReinforcement(game, me);

        Assert.Contains("weakest", plan.Justification);
    }

    [Fact]
    public void Transfer_garrisons_a_country_left_with_one_soldier()
    {
        var (game, me) = Board(5);
        var rich = game.Countries.Single(c => c.OwnerPlayerId == me);
        var thin = game.Countries.First(c => c.OwnerPlayerId != me);
        thin.OwnerPlayerId = me;
        thin.Soldiers = 1;

        var plan = NpcStrategy.ChooseTransfer(game, me);

        Assert.NotNull(plan);
        Assert.Equal(rich.Code, plan.FromCode);
        Assert.Equal(thin.Code, plan.ToCode);
        Assert.Equal(1, plan.Count);

        thin.Soldiers = 2;
        Assert.Null(NpcStrategy.ChooseTransfer(game, me));
    }
}
