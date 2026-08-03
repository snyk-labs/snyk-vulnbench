package nl.brianvermeer.coffeeshop.service;

import nl.brianvermeer.coffeeshop.domain.Order;
import nl.brianvermeer.coffeeshop.domain.Person;
import nl.brianvermeer.coffeeshop.repository.OrderRepository;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.List;

@Service
public class OrderService {

    private final OrderRepository orderRepository;

    public OrderService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    public Order save(Order order) {
        return orderRepository.save(order);
    }

    public void delete(Order order) {
        orderRepository.delete(order);
    }


    public List<Order> findByPerson(Person person) {
        return orderRepository.findOrderByPerson(person);
    }

    public List<Order> findByDate(Date minDate, Date maxDate) {
        return orderRepository.findOrderByOrderDateBetween(minDate, maxDate);
    }

    public List<Order> findAll() {
        return orderRepository.findAll();
    }

}
