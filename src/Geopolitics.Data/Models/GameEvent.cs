using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Geopolitics.Data.Models;

public enum GameEventType
{
    GameStarted, Reinforce, Transfer, AttackStarted, DiceRolled,
    CountryConquered, AttackEnded, TurnSkipped, PlayerEliminated, GameWon, GameLost
}

public class GameEvent
{
    [BsonId, BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    [BsonRepresentation(BsonType.ObjectId)]
    public string GameId { get; set; } = "";

    public int Sequence { get; set; }
    public int Round { get; set; }

    [BsonRepresentation(BsonType.String)]
    public GameEventType Type { get; set; }

    public string PlayerId { get; set; } = "";
    public string? AttackerCode { get; set; }
    public string? DefenderCode { get; set; }
    public List<int> AttackerRolls { get; set; } = new();
    public List<int> DefenderRolls { get; set; } = new();
    public int AttackerLosses { get; set; }
    public int DefenderLosses { get; set; }

    public string Message { get; set; } = "";
    public string? Justification { get; set; }   // NPC reasoning shown to the player
    public string? Commentary { get; set; }      // LLM battle commentary

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
