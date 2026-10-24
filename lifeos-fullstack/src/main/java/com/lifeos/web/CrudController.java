package com.lifeos.web;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lifeos.crud.CrudService;
import com.lifeos.crud.Specs;

/**
 * REST API used by script.js:
 *   GET    /api/{collection}        list
 *   POST   /api/{collection}        create   (JSON body)
 *   PUT    /api/{collection}/{id}   update   (JSON body, only the sent fields change)
 *   DELETE /api/{collection}/{id}   delete
 *   DELETE /api/data                delete all of my data (account stays)
 * collection = projects | tasks | events | notes | expenses | goals | habits | documents | hints
 */
@RestController
@RequestMapping("/api")
public class CrudController {
    private final CrudService crud;

    public CrudController(CrudService crud) {
        this.crud = crud;
    }

    @GetMapping("/{collection}")
    public List<Map<String, Object>> list(@PathVariable("collection") String collection,
                                          @RequestAttribute("userId") long userId) {
        return crud.list(Specs.get(collection), userId);
    }

    @PostMapping("/{collection}")
    public ResponseEntity<Map<String, Object>> create(@PathVariable("collection") String collection,
                                                      @RequestAttribute("userId") long userId,
                                                      @RequestBody Map<String, Object> body) {
        return ResponseEntity.status(201).body(crud.create(Specs.get(collection), userId, body));
    }

    @PutMapping("/{collection}/{id}")
    public Map<String, Object> update(@PathVariable("collection") String collection,
                                      @PathVariable("id") String id,
                                      @RequestAttribute("userId") long userId,
                                      @RequestBody Map<String, Object> body) {
        return crud.update(Specs.get(collection), userId, crud.parseId(id), body);
    }

    @DeleteMapping("/{collection}/{id}")
    public ResponseEntity<Void> delete(@PathVariable("collection") String collection,
                                       @PathVariable("id") String id,
                                       @RequestAttribute("userId") long userId) {
        crud.delete(Specs.get(collection), userId, crud.parseId(id));
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/data")
    public ResponseEntity<Void> clearAll(@RequestAttribute("userId") long userId) {
        crud.deleteAll(userId);
        return ResponseEntity.noContent().build();
    }
}
