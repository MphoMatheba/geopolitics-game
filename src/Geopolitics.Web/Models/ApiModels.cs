using System.ComponentModel.DataAnnotations;
using Geopolitics.Services;

namespace Geopolitics.Web.Models;

public class ReinforceRequest
{
    [Required, StringLength(60)]
    public string CountryCode { get; set; } = "";

    [Range(1, 100000)]
    public int Count { get; set; }
}

public class TransferRequest
{
    [Required, StringLength(60)]
    public string FromCode { get; set; } = "";

    [Required, StringLength(60)]
    public string ToCode { get; set; } = "";

    [Range(1, 100000)]
    public int Count { get; set; }
}

public class AttackRequest
{
    [Required, StringLength(60)]
    public string AttackerCode { get; set; } = "";

    [Required, StringLength(60)]
    public string DefenderCode { get; set; } = "";
}

public record ErrorResponse(string Error);

public record ActionResponse(GameSnapshot? Game, IReadOnlyList<EventView> Events);
