namespace Geopolitics.Services;

public enum BattleEnding { Conquered, Failed, Retreated }

// One round of dice in a battle.
public record RollSummary(
    IReadOnlyList<int> AttackerDice,
    IReadOnlyList<int> DefenderDice,
    int AttackerLosses,
    int DefenderLosses);

// A battle (or part of one) described for a commentator: who fought, what was
// rolled, and how it ended if it ended. One line of commentary is wanted for
// each roll, plus one for the ending when there is one.
public record BattleScene(
    string Attacker,
    string AttackerCountry,
    string DefenderCountry,
    IReadOnlyList<RollSummary> Rolls,
    BattleEnding? Ending)
{
    public int LineCount => Rolls.Count + (Ending != null ? 1 : 0);
}

// Anything that can turn a battle into commentary lines (for example Claude).
public interface ICommentator
{
    Task<IReadOnlyList<string>> CommentAsync(BattleScene scene, CancellationToken cancellationToken);
}
