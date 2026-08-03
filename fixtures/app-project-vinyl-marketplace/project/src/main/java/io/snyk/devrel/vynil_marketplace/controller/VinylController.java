package io.snyk.devrel.vynil_marketplace.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class VinylController {

    @GetMapping("/")
    public String home() {
        return "redirect:/index.html";
    }
}
