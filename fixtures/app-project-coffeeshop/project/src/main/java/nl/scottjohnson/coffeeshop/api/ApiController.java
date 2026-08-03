package nl.scottjohnson.coffeeshop.api;

import nl.scottjohnson.coffeeshop.domain.Person;
import nl.scottjohnson.coffeeshop.domain.Product;
import nl.scottjohnson.coffeeshop.domain.ProductType;
import nl.scottjohnson.coffeeshop.service.PersonService;
import nl.scottjohnson.coffeeshop.service.ProductService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1")
public class ApiController {

    final PersonService personService;
    final ProductService productService;

    public ApiController(PersonService personService, ProductService productService) {
        this.personService = personService;
        this.productService = productService;
    }

    @GetMapping("/person")
    public List<Person> getAllPersons() {
        return personService.getAllPersons();
    }

    @GetMapping("/person/{id}")
    public Person getPerson(@PathVariable Long id) {
        return personService.findById(id);
    }

    @GetMapping("/products")
    public List<Product> getAllProducts() {
        return productService.getAllProducts();
    }

    @GetMapping("/products/coffee")
    public List<Product> getAllCoffee() {
        return productService.getAllProducts()
                .stream()
                .filter(product -> product.getProductType() == ProductType.COFFEE)
                .toList();
    }

    @GetMapping("/products/beer")
    public List<Product> getAllBeers() {
        return productService.getAllProducts()
                .stream()
                .filter(product -> product.getProductType() == ProductType.BEER)
                .toList();
    }

}

