using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc.Rendering;

namespace Geopolitics.Web.Models;

public class NewGameViewModel
{
    [Required]
    [Display(Name = "Your country")]
    public string HomeCountryCode { get; set; } = "";

    public List<SelectListItem> Countries { get; set; } = new();
}
