using Geopolitics.Data.Models;

namespace Geopolitics.Data.Repositories;

public interface IUserRepository
{
    Task<UserDoc?> FindByUsernameAsync(string username);
    Task<UserDoc?> GetByIdAsync(string id);
    // Returns false if the username is already taken.
    Task<bool> CreateAsync(UserDoc user);
}

public interface IGameRepository
{
    Task CreateAsync(GameDoc game);
    Task<GameDoc?> GetAsync(string id);
    Task<List<GameDoc>> ListByOwnerAsync(string ownerUserId);
    // Returns false if someone else saved the game since it was loaded.
    Task<bool> SaveAsync(GameDoc game);
}

public interface IEventRepository
{
    Task AppendAsync(IEnumerable<GameEvent> events);
    Task<List<GameEvent>> GetAfterAsync(string gameId, int afterSequence, int limit = 500);
}
