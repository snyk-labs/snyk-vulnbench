package nl.scottjohnson.coffeeshop.formatter;

import nl.scottjohnson.coffeeshop.domain.Product;
import nl.scottjohnson.coffeeshop.repository.ProductRepository;
import org.springframework.format.Formatter;
import org.springframework.stereotype.Component;

import java.text.ParseException;
import java.util.Locale;

@Component
public class ProductFormatter implements Formatter<Product> {
    private final ProductRepository productRepository;

    public ProductFormatter(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    @Override
    public Product parse(String text, Locale locale) throws ParseException {
        Long id = Long.valueOf(text);
        return productRepository.findById(id).get();
    }

    @Override
    public String print(Product object, Locale locale) {
        return object != null ? object.getId().toString() : "";
    }
}
