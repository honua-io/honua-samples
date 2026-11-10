using System.Globalization;
using System.Text.Json;
using Honua.Sdk.GeoServices.FeatureServer;
using Honua.Sdk.GeoServices.FeatureServer.Models;

using var scenarios = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "scenarios.json")));
if (args.Length != 1 || !scenarios.RootElement.TryGetProperty(args[0], out var scenario))
    throw new ArgumentException("Choose property, emergency, 311 or public-works");
var baseUrl = Environment.GetEnvironmentVariable("HONUA_BASE_URL")?.TrimEnd('/');
var service = Environment.GetEnvironmentVariable("HONUA_SERVICE_ID");
var layerText = Environment.GetEnvironmentVariable("HONUA_LAYER_ID");
if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(service)
    || !int.TryParse(layerText, NumberStyles.None, CultureInfo.InvariantCulture, out var layer) || layer < 0)
    throw new ArgumentException("Set HONUA_BASE_URL, HONUA_SERVICE_ID and a non-negative numeric HONUA_LAYER_ID");
using var http = new HttpClient { BaseAddress = new Uri(baseUrl + "/") };
var client = new HonuaFeatureServerClient(http);
var result = await client.QueryAsync(service, layer, new FeatureServerQueryParams {
    Where = scenario.GetProperty("where").GetString(), OutFields = "*", OutSR = 4326,
    ReturnGeometry = true, ResultRecordCount = 20 });
var features = result.Features ?? throw new InvalidOperationException("Query omitted features");
foreach (var feature in features)
{
    if (!scenario.GetProperty("exercise").GetBoolean()) continue;
    var row = feature.Attributes;
    if (row is null || !row.TryGetValue("data_origin", out var origin) || origin.GetString() != "synthetic_demo"
        || !row.TryGetValue("is_demo", out var demo) || !IsAffirmative(demo)
        || !row.TryGetValue("exercise_only", out var exercise) || !IsAffirmative(exercise)
        || !row.TryGetValue("display_label", out var label) || label.GetString()?.Contains("DEMO DATA") != true)
        throw new InvalidOperationException("Exercise record is missing its DEMO DATA provenance");
}
Console.WriteLine(JsonSerializer.Serialize(new { source = $"{baseUrl}/rest/services/{Uri.EscapeDataString(service)}/FeatureServer/{layer}",
    scenario = args[0], limit = 20, completeDataset = false, features = features },
    new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));

static bool IsAffirmative(JsonElement value) => value.ValueKind == JsonValueKind.True
    || (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) && number == 1);
