using Geopolitics.Data.Models;
using Geopolitics.Services;

namespace Geopolitics.Services.Tests;

internal static class Fixture
{
    // A new game where the current player owns `mine` and `target` belongs to
    // another non-human player, with the given soldier counts.
    public static (GameDoc game, string me, CountryState mine, CountryState target) Setup(int mySoldiers, int targetSoldiers)
    {
        var game = TestGames.NewGame();
        var me = TurnManager.CurrentPlayer(game).PlayerId;
        var mine = game.Countries.Single(c => c.OwnerPlayerId == me);
        var target = game.Countries.First(c => c.OwnerPlayerId != me && c.OwnerPlayerId != "human");
        mine.Soldiers = mySoldiers;
        target.Soldiers = targetSoldiers;
        return (game, me, mine, target);
    }
}

public class GameActionsTests
{
    // ----- reinforcements -----

    [Fact]
    public void Reinforce_places_soldiers_and_uses_up_the_pending_pool()
    {
        var (game, me, mine, _) = Fixture.Setup(3, 3);
        game.Round = 2;
        TurnManager.BeginTurn(game);

        var result = GameActions.Reinforce(game, me, mine.Code, 2);

        Assert.True(result.Ok);
        Assert.Equal(5, mine.Soldiers);
        Assert.Equal(0, game.PendingReinforcements);
        Assert.False(GameActions.Reinforce(game, me, mine.Code, 1).Ok);
    }

    [Fact]
    public void Reinforce_cannot_exceed_the_pending_pool()
    {
        var (game, me, mine, _) = Fixture.Setup(3, 3);
        game.Round = 2;
        TurnManager.BeginTurn(game);
        Assert.False(GameActions.Reinforce(game, me, mine.Code, 3).Ok);
    }

    [Fact]
    public void Reinforce_only_works_on_your_own_countries()
    {
        var (game, me, _, target) = Fixture.Setup(3, 3);
        game.Round = 2;
        TurnManager.BeginTurn(game);
        Assert.False(GameActions.Reinforce(game, me, target.Code, 1).Ok);
    }

    [Fact]
    public void Acting_out_of_turn_is_rejected()
    {
        var (game, me, _, _) = Fixture.Setup(3, 3);
        var other = game.Players.First(p => p.PlayerId != me).PlayerId;
        Assert.False(GameActions.EndTurn(game, other).Ok);
    }

    // ----- transfers -----

    [Fact]
    public void Transfer_moves_soldiers_but_leaves_one_behind()
    {
        var (game, me, mine, target) = Fixture.Setup(5, 1);
        target.OwnerPlayerId = me;   // now the player owns two countries

        var ok = GameActions.Transfer(game, me, mine.Code, target.Code, 4);
        Assert.True(ok.Ok);
        Assert.Equal(1, mine.Soldiers);
        Assert.Equal(5, target.Soldiers);

        // Moving all 5 would leave the source with 0.
        var bad = GameActions.Transfer(game, me, target.Code, mine.Code, 5);
        Assert.False(bad.Ok);
    }

    [Fact]
    public void Transfer_is_blocked_while_an_attack_is_in_progress()
    {
        var (game, me, mine, target) = Fixture.Setup(10, 2);
        var extra = game.Countries.First(c => c.OwnerPlayerId != me && c != target);
        extra.OwnerPlayerId = me;

        Assert.True(GameActions.StartAttack(game, me, mine.Code, target.Code).Ok);
        Assert.False(GameActions.Transfer(game, me, mine.Code, extra.Code, 1).Ok);
    }

    // ----- starting an attack -----

    [Fact]
    public void StartAttack_records_the_attack()
    {
        var (game, me, mine, target) = Fixture.Setup(10, 2);

        var result = GameActions.StartAttack(game, me, mine.Code, target.Code);

        Assert.True(result.Ok);
        Assert.Equal(TurnPhase.Attacking, game.Phase);
        Assert.Equal(2, game.ActiveAttack!.DefenderSoldiersAtStart);
        Assert.True(game.HasAttackedThisTurn);
        Assert.Equal(GameEventType.AttackStarted, Assert.Single(result.Events).Type);
    }

    [Fact]
    public void StartAttack_needs_at_least_two_soldiers()
    {
        var (game, me, mine, target) = Fixture.Setup(1, 2);
        Assert.False(GameActions.StartAttack(game, me, mine.Code, target.Code).Ok);
    }

    [Fact]
    public void StartAttack_is_limited_to_one_per_turn()
    {
        var (game, me, mine, target) = Fixture.Setup(10, 2);
        game.HasAttackedThisTurn = true;
        Assert.False(GameActions.StartAttack(game, me, mine.Code, target.Code).Ok);
    }

    [Fact]
    public void StartAttack_cannot_target_your_own_country()
    {
        var (game, me, mine, target) = Fixture.Setup(10, 2);
        target.OwnerPlayerId = me;
        Assert.False(GameActions.StartAttack(game, me, mine.Code, target.Code).Ok);
    }

    // ----- rolling -----

    [Fact]
    public void Roll_applies_losses_and_keeps_the_attack_going()
    {
        var (game, me, mine, target) = Fixture.Setup(10, 2);
        GameActions.StartAttack(game, me, mine.Code, target.Code);

        // Spec example: attacker 1 and 4 against defender 2 and 3.
        var result = GameActions.Roll(game, me, new FakeDice(1, 4, 2, 3));

        Assert.True(result.Ok);
        Assert.Equal(9, mine.Soldiers);
        Assert.Equal(1, target.Soldiers);
        Assert.Equal(TurnPhase.Attacking, game.Phase);

        var rolled = result.Events.Single(e => e.Type == GameEventType.DiceRolled);
        Assert.Equal(new[] { 1, 4 }, rolled.AttackerRolls);
        Assert.Equal(new[] { 2, 3 }, rolled.DefenderRolls);
    }

    [Fact]
    public void Roll_conquers_a_country_and_eliminates_its_owner()
    {
        var (game, me, mine, target) = Fixture.Setup(5, 1);
        var previousOwner = target.OwnerPlayerId;
        GameActions.StartAttack(game, me, mine.Code, target.Code);

        var result = GameActions.Roll(game, me, new FakeDice(6, 1));

        Assert.Equal(me, target.OwnerPlayerId);
        Assert.Equal(2, target.Soldiers);   // Max(2, 1 / 2)
        Assert.Equal(TurnPhase.Action, game.Phase);
        Assert.Null(game.ActiveAttack);
        Assert.Contains(result.Events, e => e.Type == GameEventType.CountryConquered);
        Assert.Contains(result.Events, e => e.Type == GameEventType.PlayerEliminated && e.PlayerId == previousOwner);
        Assert.Equal(GameStatus.InProgress, game.Status);
    }

    [Fact]
    public void Roll_ends_the_attack_when_the_attacker_is_down_to_one_soldier()
    {
        var (game, me, mine, target) = Fixture.Setup(2, 5);
        var owner = target.OwnerPlayerId;
        GameActions.StartAttack(game, me, mine.Code, target.Code);

        var result = GameActions.Roll(game, me, new FakeDice(1, 6));

        Assert.Equal(1, mine.Soldiers);
        Assert.Equal(owner, target.OwnerPlayerId);
        Assert.Equal(TurnPhase.Action, game.Phase);
        Assert.True(game.HasAttackedThisTurn);
        Assert.Contains(result.Events, e => e.Type == GameEventType.AttackEnded);
    }

    // ----- stopping and ending turns -----

    [Fact]
    public void StopAttack_ends_the_turn()
    {
        var (game, me, mine, target) = Fixture.Setup(10, 2);
        GameActions.StartAttack(game, me, mine.Code, target.Code);

        var result = GameActions.StopAttack(game, me);

        Assert.True(result.Ok);
        Assert.NotEqual(me, TurnManager.CurrentPlayer(game).PlayerId);
        Assert.Null(game.ActiveAttack);
        Assert.False(game.HasAttackedThisTurn);
    }

    [Fact]
    public void EndTurn_requires_reinforcements_to_be_placed_first()
    {
        var (game, me, _, _) = Fixture.Setup(3, 3);
        game.Round = 2;
        TurnManager.BeginTurn(game);
        Assert.False(GameActions.EndTurn(game, me).Ok);
    }

    [Fact]
    public void EndTurn_hands_over_to_the_next_player()
    {
        var (game, me, _, _) = Fixture.Setup(3, 3);

        var result = GameActions.EndTurn(game, me);

        Assert.True(result.Ok);
        Assert.NotEqual(me, TurnManager.CurrentPlayer(game).PlayerId);
        Assert.Contains(result.Events, e => e.Type == GameEventType.TurnSkipped);
    }

    // ----- winning -----

    [Fact]
    public void Conquering_the_last_rival_wins_the_game()
    {
        var game = TestGames.NewGame();
        var human = game.Players.First(p => p.IsHuman).PlayerId;
        game.CurrentPlayerIndex = game.Players.FindIndex(p => p.IsHuman);

        var mine = game.Countries.Single(c => c.Code == "c0");
        var last = game.Countries.Single(c => c.Code == "c1");
        foreach (var c in game.Countries.Where(c => c.Code != "c1"))
            c.OwnerPlayerId = human;
        mine.Soldiers = 5;
        last.Soldiers = 1;

        Assert.True(GameActions.StartAttack(game, human, "c0", "c1").Ok);
        var result = GameActions.Roll(game, human, new FakeDice(6, 1));

        Assert.Equal(GameStatus.Won, game.Status);
        Assert.Contains(result.Events, e => e.Type == GameEventType.GameWon);
    }
}
