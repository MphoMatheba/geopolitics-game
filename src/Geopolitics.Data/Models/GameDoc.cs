using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Geopolitics.Data.Models;

public enum GameStatus { InProgress, Won, Lost }

// Where the current player is within their turn. Stored so a refresh or
// closed browser cannot let anyone escape or restart an attack.
public enum TurnPhase { Action, Attacking }

public class PlayerState
{
    public string PlayerId { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public bool IsHuman { get; set; }
    public string HomeCountryCode { get; set; } = "";
    public int TurnOrder { get; set; }
    public bool IsEliminated { get; set; }
}

public class CountryState
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public long Population { get; set; }
    public string OwnerPlayerId { get; set; } = "";
    public int Soldiers { get; set; }
}

public class ActiveAttack
{
    public string AttackerCode { get; set; } = "";
    public string DefenderCode { get; set; } = "";
    public int DefenderSoldiersAtStart { get; set; }
}

public class GameDoc
{
    [BsonId, BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    [BsonRepresentation(BsonType.ObjectId)]
    public string OwnerUserId { get; set; } = "";

    [BsonRepresentation(BsonType.String)]
    public GameStatus Status { get; set; } = GameStatus.InProgress;

    [BsonRepresentation(BsonType.String)]
    public TurnPhase Phase { get; set; } = TurnPhase.Action;

    public int Round { get; set; } = 1;
    public int CurrentPlayerIndex { get; set; }
    public int PendingReinforcements { get; set; }

    // One attack per turn: set when an attack starts, cleared when the turn changes.
    public bool HasAttackedThisTurn { get; set; }

    public ActiveAttack? ActiveAttack { get; set; }

    public List<PlayerState> Players { get; set; } = new();
    public List<CountryState> Countries { get; set; } = new();

    // Optimistic concurrency token, incremented on every successful save.
    public long Version { get; set; }

    // Last sequence number handed out to an event in the events collection.
    public int LastEventSequence { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
