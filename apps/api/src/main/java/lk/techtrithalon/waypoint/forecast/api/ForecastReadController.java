package lk.techtrithalon.waypoint.forecast.api;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import lk.techtrithalon.waypoint.forecast.application.DemandForecastService;
import lk.techtrithalon.waypoint.forecast.domain.DemandForecast;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Read-only advisory demand outlook. Nothing here is an input to planning or publication. */
@RestController
@RequestMapping("/api/v1/dispatcher/forecast")
@SecurityRequirement(name = "session")
class ForecastReadController {
    private final DemandForecastService service;

    ForecastReadController(DemandForecastService service) {
        this.service = service;
    }

    @GetMapping("/demand")
    DemandForecast demand(@AuthenticationPrincipal CurrentUser user,
                          @RequestParam(required = false) String depot,
                          @RequestParam(required = false) Integer horizonWeeks) {
        return service.outlook(user, depot, horizonWeeks);
    }
}
