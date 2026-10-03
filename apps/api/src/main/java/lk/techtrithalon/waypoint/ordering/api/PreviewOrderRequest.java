package lk.techtrithalon.waypoint.ordering.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record PreviewOrderRequest(@NotBlank String tempRequirement, @NotEmpty @Valid List<PlaceOrderRequest.Line> lines) {}
