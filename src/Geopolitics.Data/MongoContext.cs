using Geopolitics.Data.Models;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Geopolitics.Data;

public class MongoContext
{
    private readonly IMongoDatabase _db;

    public MongoContext(MongoSettings settings)
    {
        if (string.IsNullOrWhiteSpace(settings.ConnectionString))
            throw new InvalidOperationException(
                "Mongo:ConnectionString is not configured. Use user-secrets locally or an environment variable in production.");

        var client = new MongoClient(settings.ConnectionString);
        _db = client.GetDatabase(settings.DatabaseName);
    }

    public IMongoCollection<UserDoc> Users => _db.GetCollection<UserDoc>("users");
    public IMongoCollection<GameDoc> Games => _db.GetCollection<GameDoc>("games");
    public IMongoCollection<GameEvent> Events => _db.GetCollection<GameEvent>("events");

    public async Task PingAsync() =>
        await _db.RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1));

    public async Task EnsureIndexesAsync()
    {
        await Users.Indexes.CreateOneAsync(new CreateIndexModel<UserDoc>(
            Builders<UserDoc>.IndexKeys.Ascending(u => u.UsernameNormalized),
            new CreateIndexOptions { Unique = true }));

        await Games.Indexes.CreateOneAsync(new CreateIndexModel<GameDoc>(
            Builders<GameDoc>.IndexKeys.Ascending(g => g.OwnerUserId).Descending(g => g.UpdatedAtUtc)));

        await Events.Indexes.CreateOneAsync(new CreateIndexModel<GameEvent>(
            Builders<GameEvent>.IndexKeys.Ascending(e => e.GameId).Ascending(e => e.Sequence),
            new CreateIndexOptions { Unique = true }));
    }
}
