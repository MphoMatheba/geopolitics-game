using Geopolitics.Data.Models;
using MongoDB.Driver;

namespace Geopolitics.Data.Repositories;

public class MongoUserRepository(MongoContext ctx) : IUserRepository
{
    public async Task<UserDoc?> FindByUsernameAsync(string username)
    {
        var normalized = username.Trim().ToLowerInvariant();
        return await ctx.Users.Find(u => u.UsernameNormalized == normalized).FirstOrDefaultAsync();
    }

    public async Task<UserDoc?> GetByIdAsync(string id) =>
        await ctx.Users.Find(u => u.Id == id).FirstOrDefaultAsync();

    public async Task<bool> CreateAsync(UserDoc user)
    {
        user.UsernameNormalized = user.Username.Trim().ToLowerInvariant();
        try
        {
            await ctx.Users.InsertOneAsync(user);
            return true;
        }
        catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
        {
            return false;
        }
    }
}

public class MongoGameRepository(MongoContext ctx) : IGameRepository
{
    public async Task CreateAsync(GameDoc game) => await ctx.Games.InsertOneAsync(game);

    public async Task<GameDoc?> GetAsync(string id) =>
        await ctx.Games.Find(g => g.Id == id).FirstOrDefaultAsync();

    public async Task<List<GameDoc>> ListByOwnerAsync(string ownerUserId) =>
        await ctx.Games.Find(g => g.OwnerUserId == ownerUserId)
            .SortByDescending(g => g.UpdatedAtUtc).ToListAsync();

    public async Task<bool> SaveAsync(GameDoc game)
    {
        long expected = game.Version;
        game.Version = expected + 1;
        game.UpdatedAtUtc = DateTime.UtcNow;

        var result = await ctx.Games.ReplaceOneAsync(
            g => g.Id == game.Id && g.Version == expected, game);

        if (result.MatchedCount == 0)
        {
            game.Version = expected;   // roll back our local change
            return false;
        }
        return true;
    }
}

public class MongoEventRepository(MongoContext ctx) : IEventRepository
{
    public async Task AppendAsync(IEnumerable<GameEvent> events)
    {
        var list = events.ToList();
        if (list.Count > 0) await ctx.Events.InsertManyAsync(list);
    }

    public async Task<List<GameEvent>> GetAfterAsync(string gameId, int afterSequence, int limit = 500) =>
        await ctx.Events.Find(e => e.GameId == gameId && e.Sequence > afterSequence)
            .SortBy(e => e.Sequence).Limit(limit).ToListAsync();
}
