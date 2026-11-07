using System.Collections.Immutable;
using System.Text;
using System.Text.Json;
using Honua.Plugins.Abstractions;
using Honua.Samples.PluginEndpoint;

var endpoint = new UtilityStatusEndpointPlugin();
var emptyValues = ImmutableDictionary<string, string?>.Empty;
var request = new PluginEndpointRequest("GET", "/plugins/utility/status",
    emptyValues, emptyValues, emptyValues, ReadOnlyMemory<byte>.Empty, Actor: null);
var response = await endpoint.HandleAsync(request, CancellationToken.None);
using var document = JsonDocument.Parse(response.Body);
if (response.StatusCode != 200 || response.ContentType != "application/json" ||
    document.RootElement.GetProperty("status").GetString() != "ok")
{
    throw new InvalidOperationException("The plugin endpoint did not return its expected status response.");
}
Console.WriteLine(Encoding.UTF8.GetString(response.Body.Span));
