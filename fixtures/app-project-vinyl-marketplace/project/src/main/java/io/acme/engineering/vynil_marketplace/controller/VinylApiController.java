package io.acme.engineering.vynil_marketplace.controller;

import io.acme.engineering.vynil_marketplace.domain.Vinyl;
import io.acme.engineering.vynil_marketplace.service.VinylService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@RestController
@RequestMapping("/api/vinyls")
public class VinylApiController {

    private final VinylService vinylService;
    private static final String UPLOAD_DIR = "./uploads";

    public VinylApiController(VinylService vinylService) {
        this.vinylService = vinylService;
    }

    @GetMapping
    public List<Vinyl> getAllVinyls(@RequestParam(required = false) String search) {
        if (search != null && !search.isBlank()) {
            return vinylService.search(search);
        }
        return vinylService.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Vinyl> getVinyl(@PathVariable Long id) {
        var vinyl = vinylService.findById(id);
        if (vinyl == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(vinyl);
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> exportVinyls(@RequestParam(required = false) List<Long> ids) {
        var vinyls = (ids == null || ids.isEmpty())
                ? vinylService.findAll()
                : vinylService.findAllByIds(ids);

        if (vinyls.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        try (var outputStream = new ByteArrayOutputStream();
             var objectOutputStream = new ObjectOutputStream(outputStream)) {
            objectOutputStream.writeObject(vinyls);
            objectOutputStream.flush();

            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType("application/x-java-serialized-object"))
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"vinyls.ser\"")
                    .body(outputStream.toByteArray());
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/import")
    public ResponseEntity<List<Vinyl>> importVinyls(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        try (var inputStream = new ByteArrayInputStream(file.getBytes());
             var objectInputStream = new ObjectInputStream(inputStream)) {
            var imported = objectInputStream.readObject();
            var vinylsToPersist = extractVinyls(imported);

            if (vinylsToPersist.isEmpty()) {
                return ResponseEntity.badRequest().build();
            }

            for (var vinyl : vinylsToPersist) {
                vinyl.setId(null);
            }

            return ResponseEntity.ok(vinylService.saveAll(vinylsToPersist));
        } catch (IOException | ClassNotFoundException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping
    public ResponseEntity<Vinyl> createVinyl(
            @RequestParam String title,
            @RequestParam String artist,
            @RequestParam String genre,
            @RequestParam Integer releaseYear,
            @RequestParam Double price,
            @RequestParam String condition,
            @RequestParam(required = false) MultipartFile image) {

        var vinyl = new Vinyl();
        vinyl.setTitle(title);
        vinyl.setArtist(artist);
        vinyl.setGenre(genre);
        vinyl.setReleaseYear(releaseYear);
        vinyl.setPrice(price);
        vinyl.setCondition(condition);

        if (image != null && !image.isEmpty()) {
            try {
                var uploadPath = Path.of(UPLOAD_DIR);
                var filename = image.getOriginalFilename();
                var filePath = uploadPath.resolve(filename);
                Files.copy(image.getInputStream(), filePath);
                vinyl.setImageUrl("/uploads/" + filename);
            } catch (IOException e) {
                return ResponseEntity.badRequest().build();
            }
        }

        var saved = vinylService.save(vinyl);
        return ResponseEntity.ok(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Vinyl> updateVinyl(
            @PathVariable Long id,
            @RequestParam String title,
            @RequestParam String artist,
            @RequestParam String genre,
            @RequestParam Integer releaseYear,
            @RequestParam Double price,
            @RequestParam String condition,
            @RequestParam(required = false) MultipartFile image) {

        var existingVinyl = vinylService.findById(id);
        if (existingVinyl == null) {
            return ResponseEntity.notFound().build();
        }

        existingVinyl.setTitle(title);
        existingVinyl.setArtist(artist);
        existingVinyl.setGenre(genre);
        existingVinyl.setReleaseYear(releaseYear);
        existingVinyl.setPrice(price);
        existingVinyl.setCondition(condition);

        if (image != null && !image.isEmpty()) {
            try {
                var uploadPath = Path.of(UPLOAD_DIR);
                var filename = image.getOriginalFilename();
                var filePath = uploadPath.resolve(filename);
                Files.copy(image.getInputStream(), filePath);
                existingVinyl.setImageUrl("/uploads/" + filename);
            } catch (IOException e) {
                return ResponseEntity.badRequest().build();
            }
        }

        var saved = vinylService.save(existingVinyl);
        return ResponseEntity.ok(saved);
    }

    private List<Vinyl> extractVinyls(Object imported) {
        if (imported instanceof Vinyl vinyl) {
            return Collections.singletonList(vinyl);
        }

        if (imported instanceof List<?> rawList) {
            var vinyls = new ArrayList<Vinyl>();
            for (var item : rawList) {
                if (!(item instanceof Vinyl vinyl)) {
                    return List.of();
                }
                vinyls.add(vinyl);
            }
            return vinyls;
        }

        return List.of();
    }
}
