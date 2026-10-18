using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Geopolitics.Data.Models;

public class UserDoc
{
    [BsonId, BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public string Username { get; set; } = "";
    public string UsernameNormalized { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
